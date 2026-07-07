import { getReviewerId } from "@/lib/auth/session";
import { assignReviewerCampaign } from "@/lib/domain/reviewer-campaigns";
import { checkOrigin } from "@/lib/auth/origin";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const result = await assignReviewerCampaign(reviewerId);
  if (!result.assignedCampaign) {
    return ok({
      availableCount: 0,
      totalRewardPoints: 0,
      cooldownDays: result.cooldownDays,
      categoryCounts: result.categoryCounts,
      assignmentId: null,
      assignedCampaign: null,
    });
  }

  return ok({
    availableCount: result.availableCount,
    totalRewardPoints: result.totalRewardPoints,
    cooldownDays: result.cooldownDays,
    categoryCounts: result.categoryCounts,
    assignmentId: result.assignmentId,
    assignedCampaign: {
      id: result.assignedCampaign.id,
      slug: result.assignedCampaign.slug,
      campaignName: result.assignedCampaign.campaignName,
      businessName: result.assignedCampaign.businessName,
      address: result.assignedCampaign.address,
      category: result.assignedCampaign.category,
      googleMapsUrl: result.assignedCampaign.googleMapsUrl,
      rating: result.assignedCampaign.rating,
      reviewCount: result.assignedCampaign.reviewCount,
      rewardPoints: result.assignedCampaign.rewardPoints,
    },
  });
}
