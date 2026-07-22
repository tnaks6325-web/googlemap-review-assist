import { getReviewerId } from "@/lib/auth/session";
import {
  assignReviewerCampaign,
  ReviewerCampaignError,
  toConcealedReviewerAssignment,
} from "@/lib/domain/reviewer-campaigns";
import { checkOrigin } from "@/lib/auth/origin";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  let result;
  try {
    result = await assignReviewerCampaign(reviewerId);
  } catch (error) {
    if (error instanceof ReviewerCampaignError) {
      return err(error.code, error.message, error.status);
    }
    throw error;
  }
  if (!result.assignedCampaign) {
    return ok({
      availableCount: 0,
      totalRewardPoints: 0,
      cooldownDays: result.cooldownDays,
      categoryCounts: result.categoryCounts,
      assignmentId: null,
      assignmentExpiresAt: null,
      remainingSeconds: 0,
      activeAssignment: null,
      assignedCampaign: null,
      draft: null,
    });
  }

  return ok({
    availableCount: result.availableCount,
    totalRewardPoints: result.totalRewardPoints,
    cooldownDays: result.cooldownDays,
    categoryCounts: result.categoryCounts,
    assignmentId: result.assignmentId,
    assignmentExpiresAt: result.assignmentExpiresAt?.toISOString() ?? null,
    remainingSeconds: result.remainingSeconds,
    activeAssignment: result.activeAssignment
      ? {
          assignmentId: result.activeAssignment.assignmentId,
          assignmentExpiresAt:
            result.activeAssignment.assignmentExpiresAt.toISOString(),
          remainingSeconds: result.activeAssignment.remainingSeconds,
          draft: result.activeAssignment.draft,
        }
      : null,
    assignedCampaign: {
      ...toConcealedReviewerAssignment(result.assignedCampaign),
    },
    draft: result.draft,
  });
}
