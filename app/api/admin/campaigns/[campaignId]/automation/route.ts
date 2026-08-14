import { prisma } from "@/lib/db";
import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);

  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  if (!(await rateLimit(`admin:campaign-automation-toggle:${adminId}:${clientIp(req)}`, 120, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요.", 429);
  }

  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return err("INVALID_ENABLED", "자동화 ON/OFF 값을 확인해 주세요.", 400);
  }

  const { campaignId } = await params;
  const cleanCampaignId = campaignId.trim();
  if (!cleanCampaignId || cleanCampaignId.length > 191) {
    return err("INVALID_CAMPAIGN_ID", "캠페인 식별자가 올바르지 않습니다.", 400);
  }

  const updated = await prisma.campaign.update({
    where: { id: cleanCampaignId },
    data: { automationEnabled: body.enabled },
    select: { id: true, automationEnabled: true },
  }).catch(() => null);
  if (!updated) return err("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없습니다.", 404);

  return ok({ campaign: updated });
}
