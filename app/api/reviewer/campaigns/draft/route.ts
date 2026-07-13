import { checkOrigin } from "@/lib/auth/origin";
import { getReviewerId } from "@/lib/auth/session";
import {
  CampaignReviewDraftError,
  generateCampaignReviewDraftForAssignment,
} from "@/lib/domain/campaign-review-draft";
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
    return err("DRAFT_GENERATION_FAILED", "원고를 생성하지 못했습니다.", 500);
  }
}
