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
  });
}
