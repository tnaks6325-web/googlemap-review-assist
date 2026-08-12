import { campaignOperationsMutationLockResponse } from "@/lib/admin-campaign-operations-lock";
import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import {
  AdminCampaignReviewSubmissionError,
  reanalyzeAdminCampaignReviewSubmissions,
} from "@/lib/domain/admin-campaign-review-submissions";
import { recordOperationalError } from "@/lib/error-logging";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  if (!(await rateLimit(`admin:review-reanalysis:${adminId}:${clientIp(req)}`, 10, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요.", 429);
  }

  const { campaignId } = await params;
  try {
    return ok(await reanalyzeAdminCampaignReviewSubmissions(campaignId));
  } catch (cause) {
    if (cause instanceof AdminCampaignReviewSubmissionError) {
      return err(cause.code, cause.message, cause.status);
    }
    await recordOperationalError({
      severity: "ERROR",
      source: "SERVER",
      workflow: "캠페인 리뷰 검수",
      stage: "기존 제출건 AI 일괄 재검수",
      code: "CAMPAIGN_REVIEW_REANALYSIS_FAILED",
      title: "기존 리뷰 제출건을 일괄 재검수하지 못했습니다.",
      situation: "관리자가 캠페인의 수동검수 대기 건을 최신 AI 기준으로 다시 판정했습니다.",
      cause: "저장된 OCR 결과 재판정 또는 승인 처리 중 오류가 발생했습니다.",
      impact: "일부 제출건이 기존 수동검수 상태로 남아 있을 수 있습니다.",
      action: "처리 결과를 확인하고 남은 건을 다시 재검수해 주세요.",
      route: req.url,
      method: "POST",
      entityType: "campaign",
      entityId: campaignId,
      error: cause,
    });
    return err("CAMPAIGN_REVIEW_REANALYSIS_FAILED", "AI 일괄 재검수를 완료하지 못했습니다.", 500);
  }
}
