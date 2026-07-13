import { getAdminId } from "@/lib/auth/session";
import { checkOrigin } from "@/lib/auth/origin";
import { prisma } from "@/lib/db";
import { naverPlaceSnapshotFromCandidate, naverPlaceSnapshotFromManualUrl } from "@/lib/domain/admin-campaign-naver";
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

export async function PUT(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요해요", 401);

  const ip = clientIp(req);
  if (!rateLimit(`admin:naver-place:${adminId}:${ip}`, 60, HOUR).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const { campaignId } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      business: {
        include: {
          externalPlaces: {
            where: { platform: "NAVER" },
            take: 1,
          },
        },
      },
    },
  });
  if (!campaign) return err("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없어요", 404);

  const body = await req.json().catch(() => null);
  const manualUrl = typeof body?.naverUrl === "string" ? body.naverUrl : "";
  const place = manualUrl
    ? naverPlaceSnapshotFromManualUrl(manualUrl, {
        businessName: campaign.business.name,
        businessAddress: campaign.business.address,
        existingPlace: campaign.business.externalPlaces[0] ?? null,
      })
    : naverPlaceSnapshotFromCandidate(body?.candidate, campaign.business.name);
  if (!place) return err("INVALID_INPUT", "저장할 네이버 플레이스 후보가 올바르지 않아요", 400);

  const saved = await saveExternalPlace(campaign.businessId, place);
  return ok({ place: placeResponse(saved) });
}
