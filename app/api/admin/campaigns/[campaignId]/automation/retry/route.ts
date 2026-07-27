import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import {
  CampaignAutomationAdminError,
  retryCampaignAutomationSetup,
} from "@/lib/domain/campaign-automation-admin";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

export async function POST(
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
  if (!(await rateLimit(`admin:campaign-automation-retry:${adminId}:${clientIp(req)}`, 20, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요.", 429);
  }

  const { campaignId } = await params;
  const cleanCampaignId = campaignId.trim();
  if (!cleanCampaignId || cleanCampaignId.length > 191) {
    return err("INVALID_CAMPAIGN_ID", "캠페인 식별자가 올바르지 않습니다.", 400);
  }

  try {
    const result = await retryCampaignAutomationSetup(cleanCampaignId);
    return ok({ ...result, status: "QUEUED" }, 202);
  } catch (error) {
    if (error instanceof CampaignAutomationAdminError) {
      const status = error.code === "AUTOMATION_NOT_FOUND" ? 404 : 409;
      return err(error.code, error.message, status);
    }
    return err("AUTOMATION_RETRY_FAILED", "자동화 재시도를 예약하지 못했습니다.", 500);
  }
}
