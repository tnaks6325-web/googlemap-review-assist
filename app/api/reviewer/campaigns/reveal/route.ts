import { checkOrigin } from "@/lib/auth/origin";
import { getReviewerId } from "@/lib/auth/session";
import {
  getReviewerCampaignPlaceReveal,
  ReviewerCampaignError,
} from "@/lib/domain/reviewer-campaigns";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요.", 403);
  }

  const reviewerId = await getReviewerId();
  if (!reviewerId) {
    return err("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const body = (await req.json().catch(() => ({}))) as {
    assignmentId?: unknown;
  };
  const assignmentId =
    typeof body.assignmentId === "string" ? body.assignmentId : "";

  try {
    return ok(
      await getReviewerCampaignPlaceReveal(reviewerId, assignmentId),
    );
  } catch (error) {
    if (error instanceof ReviewerCampaignError) {
      return err(error.code, error.message, error.status);
    }
    throw error;
  }
}
