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
import { ok, err } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

function placeResponse(place: {
  name: string;
  url: string | null;
  address: string | null;
  category: string | null;
  matchStatus: string;
  matchConfidence: number | null;
  syncedAt: Date | null;
}) {
  return {
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
  } catch {
    return err("NAVER_LOCAL_SEARCH_FAILED", "네이버 플레이스 후보를 확인하지 못했어요", 502);
  }
}
