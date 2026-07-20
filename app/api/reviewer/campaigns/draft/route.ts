import { checkOrigin } from "@/lib/auth/origin";
import { getReviewerId } from "@/lib/auth/session";
import {
  CampaignReviewDraftError,
  generateCampaignReviewDraftForAssignment,
} from "@/lib/domain/campaign-review-draft";
import { recordOperationalError } from "@/lib/error-logging";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);

  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요합니다.", 401);

  try {
    const body = (await req.json().catch(() => ({}))) as {
      assignmentId?: unknown;
      regenerate?: unknown;
    };
    const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId : "";
    const regenerate = body.regenerate === true;
    const result = await generateCampaignReviewDraftForAssignment(reviewerId, assignmentId, { regenerate });
    return ok(result);
  } catch (e) {
    if (e instanceof CampaignReviewDraftError) {
      return err(e.code, e.message, e.status);
    }
    await recordOperationalError({
      severity: "ERROR",
      source: "INTEGRATION",
      workflow: "리뷰 원고 생성",
      stage: "캠페인 자료 분석과 원고 작성",
      code: "DRAFT_GENERATION_FAILED",
      title: "리뷰 원고를 생성하지 못했습니다.",
      situation: "리뷰어가 배정된 캠페인의 리뷰 원고 생성을 요청하던 중이었습니다.",
      cause: "캠페인 자료를 읽거나 원고 생성 서비스를 호출하는 과정에서 예상하지 못한 오류가 발생했습니다.",
      impact: "리뷰어에게 새 원고가 제공되지 않았습니다.",
      action: "외부 원고 생성 서비스와 캠페인 자료 상태를 확인한 뒤 다시 시도해 주세요.",
      route: req.url,
      method: "POST",
      entityType: "reviewer",
      entityId: reviewerId,
      error: e,
    });
    return err("DRAFT_GENERATION_FAILED", "원고를 생성하지 못했습니다.", 500);
  }
}
