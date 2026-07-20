import { ReviewFlow } from "@/components/flow/ReviewFlow";
import { Footer } from "@/components/Footer";
import { getReviewerId } from "@/lib/auth/session";
import { getPublicCampaignDetail, listPublicCampaigns } from "@/lib/domain/operator-campaigns";
import { getPublicCampaignAvailabilitySummary } from "@/lib/domain/reviewer-campaigns";

export const runtime = "nodejs";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let campaign = await getPublicCampaignDetail(slug);
  if (!campaign && slug === "demo") {
    const fallbackCampaign = (await listPublicCampaigns())[0] ?? null;
    campaign = fallbackCampaign ? await getPublicCampaignDetail(fallbackCampaign.slug) : null;
  }

  if (!campaign || !campaign.active) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-bold text-ink">지금은 참여할 수 없어요</p>
        <p className="mt-2 text-[15px] text-ink-sub">캠페인이 종료되었거나 잘못된 링크예요.</p>
      </main>
    );
  }

  const [summary, reviewerId] = await Promise.all([
    getPublicCampaignAvailabilitySummary(),
    getReviewerId(),
  ]);

  return (
    <>
      <ReviewFlow
        initialRewardPoints={campaign.rewardPoints}
        initialAvailableCount={summary.availableCount}
        initialTotalRewardPoints={summary.totalRewardPoints}
        initialCategoryCounts={summary.categoryCounts}
        cooldownDays={summary.cooldownDays}
        initialReviewerSignedIn={Boolean(reviewerId)}
      />
      <Footer />
    </>
  );
}
