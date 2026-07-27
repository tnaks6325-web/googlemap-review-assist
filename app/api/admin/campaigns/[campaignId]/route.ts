import { prisma } from "@/lib/db";
import { campaignOperationsMutationLockResponse } from "@/lib/admin-campaign-operations-lock";
import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { parseCampaignRewardPoints } from "@/lib/domain/campaign-reward-points";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  if (!checkOrigin(req)) {
    return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);
  }

  const adminId = await getAdminId();
  if (!adminId) {
    return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  }

  const lockResponse = await campaignOperationsMutationLockResponse();
  if (lockResponse) return lockResponse;

  const ip = clientIp(req);
  if (!(await rateLimit(`admin:campaign-update:${adminId}:${ip}`, 120, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요.", 429);
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const rewardPoints = parseCampaignRewardPoints(body?.rewardPoints);
  if (rewardPoints === null) {
    return err(
      "INVALID_REWARD_POINTS",
      "지급 포인트는 1P 이상 100,000P 이하의 정수로 입력해 주세요.",
      400,
    );
  }

  const { campaignId } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) {
    return err("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없습니다.", 404);
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { rewardPoints },
    select: { id: true, rewardPoints: true },
  });

  return ok({ campaign: updated });
}
