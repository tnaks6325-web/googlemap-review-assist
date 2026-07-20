import { getAdminId } from "@/lib/auth/session";
import { checkOrigin } from "@/lib/auth/origin";
import { prisma } from "@/lib/db";
import { findNaverCandidates } from "@/lib/domain/external-place-providers";
import {
  naverAutoConnectableSnapshot,
  naverCandidateSearchQueries,
  naverSearchTargetFromCampaign,
} from "@/lib/domain/admin-campaign-naver";
import { saveExternalPlace } from "@/lib/domain/external-place-save";
import { recordOperationalError } from "@/lib/error-logging";
import { ok, err } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

function placeResponse(place: {
  externalId: string | null;
  name: string;
  url: string | null;
  address: string | null;
  category: string | null;
  matchStatus: string;
  matchConfidence: number | null;
  syncedAt: Date | null;
}) {
  return {
    externalId: place.externalId,
    name: place.name,
    url: place.url,
    address: place.address,
    category: place.category,
    matchStatus: place.matchStatus,
    matchConfidence: place.matchConfidence,
    syncedAt: place.syncedAt?.toISOString() ?? null,
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요해요", 401);

  const ip = clientIp(req);
  if (!(await rateLimit(`admin:naver-candidates:${adminId}:${ip}`, 60, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const { campaignId } = await params;
  const body = await req.json().catch(() => null);
  const query = body?.query ? String(body.query).trim().slice(0, 120) : undefined;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      business: {
        include: {
          externalPlaces: {
            where: { platform: "GOOGLE" },
            take: 1,
          },
        },
      },
    },
  });

  if (!campaign) return err("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없어요", 404);

  const target = naverSearchTargetFromCampaign(campaign);
  const searchQueries = naverCandidateSearchQueries(target.base, query);

  try {
    let finalResult = {
      candidates: [],
      providerConfigured: true,
    } as Awaited<ReturnType<typeof findNaverCandidates>>;
    let finalQuery = searchQueries[0] ?? target.query;

    for (const searchQuery of searchQueries.length ? searchQueries : [target.query]) {
      const result = await findNaverCandidates(target.base, searchQuery);
      if (!result.providerConfigured) {
        return ok({ ...result, base: target.base, query: searchQuery });
      }

      const resultScore = result.candidates[0]?.matchConfidence ?? -1;
      const finalScore = finalResult.candidates[0]?.matchConfidence ?? -1;
      if (resultScore > finalScore) {
        finalResult = result;
        finalQuery = searchQuery;
      }

      const autoPlace = naverAutoConnectableSnapshot(
        result.candidates[0],
        target.base.name,
      );
      if (autoPlace) {
        const saved = await saveExternalPlace(
          campaign.businessId,
          autoPlace,
        );
        return ok({
          ...result,
          base: target.base,
          query: searchQuery,
          place: placeResponse(saved),
        });
      }
    }

    return ok({ ...finalResult, base: target.base, query: finalQuery });
  } catch (error) {
    await recordOperationalError({
      severity: "ERROR",
      source: "INTEGRATION",
      workflow: "네이버 장소 자동 연결",
      stage: "후보 검색과 Place ID 확인",
      code: "NAVER_LOCAL_SEARCH_FAILED",
      title: "네이버 장소 후보를 확인하지 못했습니다.",
      situation: "관리자가 캠페인의 네이버 플레이스 자동 보정을 실행하던 중이었습니다.",
      cause: "네이버 검색 결과를 불러오거나 후보 페이지에서 Place ID를 확인하는 과정이 실패했습니다.",
      impact: "해당 캠페인의 네이버 Place ID가 자동 저장되지 않았습니다.",
      action: "네이버 검색 서비스 상태와 캠페인 상호·주소를 확인한 뒤 다시 실행해 주세요.",
      route: req.url,
      method: "POST",
      entityType: "campaign",
      entityId: campaignId,
      error,
    });
    return err("NAVER_LOCAL_SEARCH_FAILED", "네이버 플레이스 후보를 확인하지 못했어요", 502);
  }
}
