import { getReviewerId } from "@/lib/auth/session";
import { getReviewerCampaignAvailability } from "@/lib/domain/reviewer-campaigns";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const availability = await getReviewerCampaignAvailability(reviewerId);
  return ok({
    availableCount: availability.availableCount,
    totalRewardPoints: availability.totalRewardPoints,
    cooldownDays: availability.cooldownDays,
    categoryCounts: availability.categoryCounts,
    activeAssignment: availability.activeAssignment
      ? {
          assignmentId: availability.activeAssignment.assignmentId,
          assignmentExpiresAt:
            availability.activeAssignment.assignmentExpiresAt.toISOString(),
          remainingSeconds: availability.activeAssignment.remainingSeconds,
          assignedCampaign: {
            id: availability.activeAssignment.assignedCampaign.id,
            slug: availability.activeAssignment.assignedCampaign.slug,
            campaignName:
              availability.activeAssignment.assignedCampaign.campaignName,
            businessName:
              availability.activeAssignment.assignedCampaign.businessName,
            address: availability.activeAssignment.assignedCampaign.address,
            category: availability.activeAssignment.assignedCampaign.category,
            googleMapsUrl:
              availability.activeAssignment.assignedCampaign.googleMapsUrl,
            rating: availability.activeAssignment.assignedCampaign.rating,
            reviewCount:
              availability.activeAssignment.assignedCampaign.reviewCount,
            rewardPoints:
              availability.activeAssignment.assignedCampaign.rewardPoints,
          },
        }
      : null,
  });
}
