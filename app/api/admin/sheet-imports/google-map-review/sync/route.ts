import { ok, err } from "@/lib/http";
import { recordOperationalError } from "@/lib/error-logging";
import { getAdminId } from "@/lib/auth/session";
import { checkOrigin } from "@/lib/auth/origin";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import {
  findBestNaverPlaceSnapshotForCampaign,
  MIN_AUTO_NAVER_MATCH_CONFIDENCE,
} from "@/lib/domain/admin-campaign-naver";
import { resolveGooglePlace } from "@/lib/domain/external-place-providers";
import { syncGoogleMapReviewCampaignRows } from "@/lib/domain/google-sheet-campaign-sync";
import {
  applyResolvedGooglePlaceNameToSheetRow,
  excludeExistingGoogleMapReviewCampaignRows,
  googlePlaceInputForSheetRow,
  parseGoogleMapReviewSheet,
  summarizeSheetImportRows,
  type SheetImportNaverPlacePreview,
  type SheetImportDryRunRow,
  type SheetImportPlacePreview,
} from "@/lib/domain/google-sheet-import";
import {
  GoogleSheetsApiError,
  GoogleSheetsConfigError,
  googleSheetsFailureMessage,
  readGoogleSheetValues,
} from "@/lib/google-sheets";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;
const PLACE_PREVIEW_LIMIT = 12;
const STRONG_NAVER_MATCH_CONFIDENCE = MIN_AUTO_NAVER_MATCH_CONFIDENCE;
const GOOGLE_MAP_REVIEW_SPREADSHEET_ID = "1dktrajeVNFQAGShNe5bMmeA_LGtLF386fwQ2Z-xqHKs";

function googlePlaceErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/401|403/.test(message)) return "Google Places API 키 또는 API 제한 설정을 확인해 주세요";
  if (/429/.test(message)) return "Google Places API 할당량을 확인해 주세요";
  if (/unsupported google/.test(message)) return "Google Maps 링크 형식을 확인해 주세요";
  return "Google Places 확인에 실패했습니다";
}

function skippedGooglePlacePreview(input: string, message: string): SheetImportPlacePreview {
  return {
    status: "SKIPPED",
    providerConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    input,
    placeId: null,
    name: null,
    address: null,
    url: null,
    rating: null,
    reviewCount: null,
    matchConfidence: null,
    message,
  };
}

function failedGooglePlacePreview(input: string, message: string): SheetImportPlacePreview {
  return {
    status: "FAILED",
    providerConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    input,
    placeId: null,
    name: null,
    address: null,
    url: null,
    rating: null,
    reviewCount: null,
    matchConfidence: null,
    message,
  };
}

function isResolvedGooglePlace(place: { externalId: string | null; name: string }) {
  return Boolean(place.externalId && !place.externalId.startsWith("google:") && place.name.trim());
}

function skippedNaverPlacePreview(query: string, message: string): SheetImportNaverPlacePreview {
  return {
    status: "SKIPPED",
    providerConfigured: Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET),
    query,
    candidateCount: 0,
    placeId: null,
    name: null,
    address: null,
    category: null,
    url: null,
    matchConfidence: null,
    message,
  };
}

function failedNaverPlacePreview(query: string, message: string): SheetImportNaverPlacePreview {
  return {
    status: "FAILED",
    providerConfigured: Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET),
    query,
    candidateCount: 0,
    placeId: null,
    name: null,
    address: null,
    category: null,
    url: null,
    matchConfidence: null,
    message,
  };
}

function naverPreviewSourceForRow(row: SheetImportDryRunRow) {
  const googlePlace =
    row.googlePlace &&
    row.googlePlace.status !== "FAILED" &&
    row.googlePlace.status !== "SKIPPED" &&
    row.googlePlace.name
      ? {
          name: row.googlePlace.name,
          address: row.googlePlace.address,
          lat: null,
          lng: null,
        }
      : null;
  const name = googlePlace?.name || row.businessName || row.searchKeyword;
  const address = googlePlace?.address ?? null;

  return {
    name,
    address,
    externalPlaces: googlePlace ? [googlePlace] : [],
  };
}

async function addGooglePlacePreviews(rows: SheetImportDryRunRow[], limit = PLACE_PREVIEW_LIMIT) {
  let previewCount = 0;

  const enriched: SheetImportDryRunRow[] = [];
  for (const row of rows) {
    const input = googlePlaceInputForSheetRow(row);
    if (!input || row.status !== "READY") {
      enriched.push(row);
      continue;
    }

    if (previewCount >= limit) {
      enriched.push({
        ...row,
        googlePlace: skippedGooglePlacePreview(input, `상위 ${limit}개 행만 Places 미리보기를 실행합니다`),
      });
      continue;
    }

    previewCount += 1;
    try {
      const result = await resolveGooglePlace(input);
      const { place, providerConfigured } = result;
      const resolved = providerConfigured && isResolvedGooglePlace(place);
      const message = providerConfigured
        ? resolved
          ? null
          : "Google Places에서 확정 후보를 찾지 못해 입력값 기준으로 표시합니다"
        : "GOOGLE_PLACES_API_KEY가 설정되지 않아 입력값 기준으로만 표시합니다";
      const warning = message ? [message] : [];
      const namedRow = applyResolvedGooglePlaceNameToSheetRow(row, place, providerConfigured);
      const nameErrors = namedRow.businessName.trim() ? [] : ["업체명을 Google Place URL로 확인하지 못했습니다"];

      enriched.push({
        ...namedRow,
        status: nameErrors.length ? "ERROR" : namedRow.status,
        errors: [...namedRow.errors, ...nameErrors],
        warnings: [...namedRow.warnings, ...warning],
        googlePlace: {
          status: resolved ? "RESOLVED" : "MANUAL",
          providerConfigured,
          input,
          placeId: place.externalId,
          name: place.name || null,
          address: place.address,
          url: place.url,
          rating: place.rating,
          reviewCount: place.reviewCount,
          matchConfidence: place.matchConfidence,
          message,
        },
      });
    } catch (error) {
      const message = googlePlaceErrorMessage(error);
      enriched.push({
        ...row,
        warnings: [...row.warnings, message],
        googlePlace: failedGooglePlacePreview(input, message),
      });
    }
  }

  return enriched;
}

async function addNaverPlacePreviews(rows: SheetImportDryRunRow[], limit = PLACE_PREVIEW_LIMIT) {
  let previewCount = 0;
  const enriched: SheetImportDryRunRow[] = [];

  for (const row of rows) {
    const source = naverPreviewSourceForRow(row);
    const query = [source.name, source.address].filter(Boolean).join(" ").slice(0, 120);

    if (row.status !== "READY" || !source.name) {
      enriched.push(row);
      continue;
    }

    if (previewCount >= limit) {
      enriched.push({
        ...row,
        naverPlace: skippedNaverPlacePreview(query, `상위 ${limit}개 행만 네이버 후보를 미리 확인합니다.`),
      });
      continue;
    }

    previewCount += 1;
    try {
      const result = await findBestNaverPlaceSnapshotForCampaign({
        business: source,
      });

      if (!result.providerConfigured) {
        enriched.push({
          ...row,
          naverPlace: skippedNaverPlacePreview(result.query || query, "NAVER_CLIENT_ID/SECRET이 설정되지 않았습니다."),
        });
        continue;
      }

      if (!result.place) {
        enriched.push({
          ...row,
          naverPlace: {
            status: "NEEDS_REVIEW",
            providerConfigured: true,
            query: result.query || query,
            candidateCount: result.candidateCount,
            placeId: null,
            name: null,
            address: null,
            category: null,
            url: null,
            matchConfidence: null,
            message: "네이버 지역검색에서 충분히 일치하는 후보를 찾지 못했습니다.",
          },
        });
        continue;
      }

      const confidence = result.place.matchConfidence;
      enriched.push({
        ...row,
        naverPlace: {
          status:
            confidence != null && confidence >= STRONG_NAVER_MATCH_CONFIDENCE
              ? "FOUND"
              : "NEEDS_REVIEW",
          providerConfigured: true,
          query: result.query || query,
          candidateCount: result.candidateCount,
          placeId: result.place.externalId,
          name: result.place.name,
          address: result.place.address,
          category: result.place.category,
          url: result.place.url,
          matchConfidence: confidence,
          message:
            confidence != null && confidence >= STRONG_NAVER_MATCH_CONFIDENCE
              ? null
              : "후보는 찾았지만 관리자가 일치 여부를 확인해야 합니다.",
        },
      });
    } catch {
      enriched.push({
        ...row,
        naverPlace: failedNaverPlacePreview(query, "네이버 지역검색 확인에 실패했습니다."),
      });
    }
  }

  return enriched;
}

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요해요", 401);

  const ip = clientIp(req);
  if (!(await rateLimit(`admin:sheet-import:${adminId}:${ip}`, 20, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const body = await req.json().catch(() => null);
  const dryRun = body?.dryRun !== false;

  const spreadsheetId = GOOGLE_MAP_REVIEW_SPREADSHEET_ID;
  const range = process.env.GOOGLE_SHEETS_RANGE ?? "'광고요청시트'!A:U";

  try {
    const sheet = await readGoogleSheetValues(spreadsheetId, range);
    const dryRunResult = parseGoogleMapReviewSheet(sheet.values);
    const existingCampaigns = dryRun
      ? await prisma.campaign.findMany({
          select: {
            business: {
              select: {
                name: true,
                googlePlaceId: true,
                externalPlaces: {
                  where: { platform: "GOOGLE" },
                  select: { externalId: true },
                },
              },
            },
          },
        })
      : [];
    const existingCampaignReferences = existingCampaigns.map(({ business }) => ({
      businessName: business.name,
      googlePlaceIds: [business.googlePlaceId, ...business.externalPlaces.map((place) => place.externalId)],
    }));
    const initialRows = dryRun
      ? excludeExistingGoogleMapReviewCampaignRows(
          dryRunResult.rows,
          existingCampaignReferences
        )
      : { rows: dryRunResult.rows, skippedExistingCampaigns: 0 };
    const googleRows = await addGooglePlacePreviews(
      initialRows.rows,
      dryRun ? PLACE_PREVIEW_LIMIT : Number.POSITIVE_INFINITY
    );
    const filteredGoogleRows = dryRun
      ? excludeExistingGoogleMapReviewCampaignRows(
          googleRows,
          existingCampaignReferences
        )
      : { rows: googleRows, skippedExistingCampaigns: 0 };
    const rows = dryRun ? await addNaverPlacePreviews(filteredGoogleRows.rows, PLACE_PREVIEW_LIMIT) : filteredGoogleRows.rows;
    const sync = dryRun ? null : await syncGoogleMapReviewCampaignRows(rows);
    return ok({
      dryRun,
      source: {
        spreadsheetId,
        range: sheet.range,
      },
      ...dryRunResult,
      summary: summarizeSheetImportRows(rows),
      excludedExistingCampaignCount:
        initialRows.skippedExistingCampaigns + filteredGoogleRows.skippedExistingCampaigns,
      rows,
      sync,
    });
  } catch (e) {
    if (e instanceof GoogleSheetsConfigError) {
      await recordOperationalError({
        severity: "CRITICAL",
        source: "INTEGRATION",
        workflow: "캠페인 가져오기",
        stage: "Google Sheets 연결 설정 확인",
        code: "SHEETS_CONFIG_MISSING",
        title: "Google Sheets 연결 설정이 없어 캠페인을 가져오지 못했습니다.",
        situation: "관리자가 광고 요청 시트 검사 또는 캠페인 반영을 실행하던 중이었습니다.",
        cause: "서버에 Google Sheets 인증 환경변수가 설정되지 않았습니다.",
        impact: "시트 검사와 새 캠페인 반영이 시작되지 않았습니다.",
        action: "Google 서비스 계정과 시트 ID 환경변수를 설정한 뒤 다시 실행해 주세요.",
        route: req.url,
        method: "POST",
        error: e,
      });
      return err("SHEETS_CONFIG_MISSING", "Google Sheets 환경변수가 설정되지 않았어요", 500);
    }
    if (e instanceof GoogleSheetsApiError) {
      console.warn("google_sheets_read_failed", {
        stage: e.stage,
        status: e.status,
        providerMessage: e.message,
      });
      await recordOperationalError({
        severity: "ERROR",
        source: "INTEGRATION",
        workflow: "캠페인 가져오기",
        stage: "Google Sheets 내용 읽기",
        code: "SHEETS_READ_FAILED",
        title: "Google Sheets 내용을 읽지 못했습니다.",
        situation: "관리자가 광고 요청 시트 검사 또는 캠페인 반영을 실행하던 중이었습니다.",
        cause: "Google API가 시트 접근을 거부했거나 일시적으로 응답하지 않았습니다.",
        impact: "새 캠페인 정보가 반영되지 않았으며 기존 캠페인에는 변화가 없습니다.",
        action: "시트 공유 권한과 Google API 상태를 확인한 뒤 다시 실행해 주세요.",
        route: req.url,
        method: "POST",
        error: e,
        metadata: { providerStage: e.stage, providerStatus: e.status },
      });
      return err("SHEETS_READ_FAILED", googleSheetsFailureMessage(e), 502);
    }
    await recordOperationalError({
      severity: "ERROR",
      source: "SERVER",
      workflow: "캠페인 가져오기",
      stage: dryRun ? "시트 검사 결과 만들기" : "캠페인 데이터 저장",
      code: "SHEETS_IMPORT_FAILED",
      title: "캠페인 시트 처리를 완료하지 못했습니다.",
      situation: "관리자가 광고 요청 시트 검사 또는 캠페인 반영을 실행하던 중이었습니다.",
      cause: "시트 행을 해석하거나 캠페인 정보를 저장하는 과정에서 예상하지 못한 오류가 발생했습니다.",
      impact: dryRun ? "검사 결과를 확인할 수 없습니다." : "캠페인 반영이 완료되지 않았습니다.",
      action: "시트 열 형식과 오류 기술 정보를 확인한 뒤 다시 실행해 주세요.",
      route: req.url,
      method: "POST",
      error: e,
    });
    return err("SHEETS_IMPORT_FAILED", "시트 검사 중 문제가 생겼어요", 500);
  }
}
