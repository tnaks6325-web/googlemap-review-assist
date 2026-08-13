import { campaignOperationsMutationLockResponse } from "@/lib/admin-campaign-operations-lock";
import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import {
  CampaignAutomationAdminError,
  startManualCampaignSetup,
} from "@/lib/domain/campaign-automation-admin";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);

  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);

  const lockResponse = await campaignOperationsMutationLockResponse();
  if (lockResponse) return lockResponse;
  if (!(await rateLimit(`admin:campaign-manual-setup:${adminId}:${clientIp(req)}`, 20, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요.", 429);
  }

  const { campaignId } = await params;
  const cleanCampaignId = campaignId.trim();
  if (!cleanCampaignId || cleanCampaignId.length > 191) {
    return err("INVALID_CAMPAIGN_ID", "캠페인 식별자가 올바르지 않습니다.", 400);
  }

  try {
    const result = await startManualCampaignSetup(cleanCampaignId);
    return ok({ ...result, status: "QUEUED" }, 202);
  } catch (error) {
    if (error instanceof CampaignAutomationAdminError) {
      return err(error.code, error.message, error.code === "CAMPAIGN_NOT_FOUND" ? 404 : 409);
    }
    return err("MANUAL_SETUP_FAILED", "수동 세팅 작업을 시작하지 못했습니다.", 500);
  }
}
