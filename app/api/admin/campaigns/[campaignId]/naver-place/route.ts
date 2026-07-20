import { getAdminId } from "@/lib/auth/session";
import { checkOrigin } from "@/lib/auth/origin";
import { prisma } from "@/lib/db";
import {
  naverPlaceSnapshotFromCandidate,
  naverPlaceSnapshotFromPlaceId,
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

export async function PUT(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요해요", 401);

  const ip = clientIp(req);
  if (!(await rateLimit(`admin:naver-place:${adminId}:${ip}`, 60, HOUR)).ok) {
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
  const hasManualPlaceId = typeof body?.naverPlaceId === "string";
  const manualPlaceId =
    hasManualPlaceId ? body.naverPlaceId : "";
  const place = hasManualPlaceId
    ? naverPlaceSnapshotFromPlaceId(manualPlaceId, {
        businessName: campaign.business.name,
        businessAddress: campaign.business.address,
        existingPlace: campaign.business.externalPlaces[0] ?? null,
      })
    : naverPlaceSnapshotFromCandidate(body?.candidate, campaign.business.name);
  if (!place) {
    return err(
      "INVALID_INPUT",
      hasManualPlaceId
        ? "네이버 플레이스 ID는 숫자만 입력해 주세요"
        : "저장할 네이버 플레이스 후보가 올바르지 않아요",
      400,
    );
  }

  try {
    const saved = await saveExternalPlace(campaign.businessId, place);
    return ok({ place: placeResponse(saved) });
  } catch (error) {
    await recordOperationalError({
      severity: "ERROR",
      source: "INTEGRATION",
      workflow: "네이버 장소 연결",
      stage: "Place ID 저장",
      code: "NAVER_PLACE_SAVE_FAILED",
      title: "네이버 Place ID를 저장하지 못했습니다.",
      situation: "관리자가 선택하거나 입력한 네이버 장소를 캠페인에 연결하던 중이었습니다.",
      cause: "확인한 장소 정보를 데이터베이스에 저장하는 과정에서 오류가 발생했습니다.",
      impact: "해당 캠페인의 네이버 장소 연결이 완료되지 않았습니다.",
      action: "잠시 후 다시 저장하고 계속 실패하면 데이터베이스 상태를 확인해 주세요.",
      route: req.url,
      method: "PUT",
      entityType: "campaign",
      entityId: campaignId,
      error,
    });
    return err("NAVER_PLACE_SAVE_FAILED", "네이버 플레이스 ID를 저장하지 못했습니다.", 500);
  }
}
