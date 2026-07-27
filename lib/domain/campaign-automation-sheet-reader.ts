import { resolveGooglePlace } from "@/lib/domain/external-place-providers";
import {
  applyResolvedGooglePlaceNameToSheetRow,
  googlePlaceInputForSheetRow,
  parseGoogleMapReviewSheet,
  type SheetImportDryRunRow,
} from "@/lib/domain/google-sheet-import";
import { readGoogleSheetValues } from "@/lib/google-sheets";

export const GOOGLE_MAP_REVIEW_SPREADSHEET_ID = "1dktrajeVNFQAGShNe5bMmeA_LGtLF386fwQ2Z-xqHKs";
export const GOOGLE_MAP_REVIEW_SHEET_RANGE = "'광고요청시트'!A:U";

function resolvedGooglePlace(row: SheetImportDryRunRow, input: string, place: Awaited<ReturnType<typeof resolveGooglePlace>>["place"], providerConfigured: boolean) {
  const resolved = providerConfigured && Boolean(place.externalId && !place.externalId.startsWith("google:") && place.name.trim());
  const namedRow = applyResolvedGooglePlaceNameToSheetRow(row, place, providerConfigured);
  const nameErrors = namedRow.businessName.trim() ? [] : ["업체명을 Google Place URL로 확인하지 못했습니다"];
  return {
    ...namedRow,
    status: nameErrors.length ? "ERROR" as const : namedRow.status,
    errors: [...namedRow.errors, ...nameErrors],
    warnings: resolved ? namedRow.warnings : [...namedRow.warnings, "Google Places에서 확정 후보를 찾지 못했습니다"],
    googlePlace: {
      status: resolved ? "RESOLVED" as const : "MANUAL" as const,
      providerConfigured,
      input,
      placeId: place.externalId,
      name: place.name || null,
      address: place.address,
      url: place.url,
      rating: place.rating,
      reviewCount: place.reviewCount,
      matchConfidence: place.matchConfidence,
      message: resolved ? null : "Google Places에서 확정 후보를 찾지 못했습니다",
    },
  };
}

export async function enrichSheetRowsWithGooglePlaces(rows: SheetImportDryRunRow[]) {
  const enriched: SheetImportDryRunRow[] = [];
  for (const row of rows) {
    const input = googlePlaceInputForSheetRow(row);
    if (!input || row.status !== "READY") {
      enriched.push(row);
      continue;
    }
    try {
      const { place, providerConfigured } = await resolveGooglePlace(input);
      enriched.push(resolvedGooglePlace(row, input, place, providerConfigured));
    } catch {
      enriched.push({
        ...row,
        warnings: [...row.warnings, "Google Places 확인에 실패했습니다"],
        googlePlace: {
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
          message: "Google Places 확인에 실패했습니다",
        },
      });
    }
  }
  return enriched;
}

export function sheetNameFromRange(range: string) {
  return range.match(/'?([^'!]+)'?!/)?.[1] ?? "광고요청시트";
}

export async function readCampaignAutomationSheetRows() {
  const spreadsheetId = process.env.GOOGLE_MAP_REVIEW_SPREADSHEET_ID?.trim() || GOOGLE_MAP_REVIEW_SPREADSHEET_ID;
  const range = process.env.GOOGLE_SHEETS_RANGE?.trim() || GOOGLE_MAP_REVIEW_SHEET_RANGE;
  const sheet = await readGoogleSheetValues(spreadsheetId, range);
  const parsed = parseGoogleMapReviewSheet(sheet.values);
  return {
    spreadsheetId,
    sheetName: sheetNameFromRange(sheet.range || range),
    rows: await enrichSheetRowsWithGooglePlaces(parsed.rows),
  };
}
