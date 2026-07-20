import { connection } from "next/server";
import {
  ReviewerCampaignPanel,
  ReviewerHistoryPanel,
  ReviewerProfilePanel,
} from "@/components/campaign/ReviewerDashboardPanels";
import { ReviewerDashboardTabs } from "@/components/campaign/ReviewerDashboardTabs";
import { ReviewerHero } from "@/components/campaign/ReviewerHero";
import { Footer } from "@/components/Footer";
import { ReviewerLogoutButton } from "@/components/auth/ReviewerLogoutButton";
import { getReviewerId } from "@/lib/auth/session";
import { listPublicCampaigns } from "@/lib/domain/operator-campaigns";
import {
  getPublicCampaignAvailabilitySummary,
  getReviewerCampaignAvailability,
} from "@/lib/domain/reviewer-campaigns";
import {
  getReviewerHomeAccount,
  getReviewerHomeDashboard,
} from "@/lib/domain/reviewer-home";

export const runtime = "nodejs";

async function loadReviewerHome(reviewerId: string | null) {
  if (reviewerId) {
    const [account, availability, dashboard] = await Promise.all([
      getReviewerHomeAccount(reviewerId),
      getReviewerCampaignAvailability(reviewerId),
      getReviewerHomeDashboard(reviewerId),
    ]);
    return {
      account,
      dashboard,
      campaigns: availability.campaigns,
      availableCount: availability.availableCount,
      totalRewardPoints: availability.totalRewardPoints,
    };
  }

  const [campaigns, availability] = await Promise.all([
    listPublicCampaigns(),
    getPublicCampaignAvailabilitySummary(),
  ]);
  return {
    account: null,
    dashboard: null,
    campaigns,
    availableCount: availability.availableCount,
    totalRewardPoints: availability.totalRewardPoints,
  };
}

export default async function CampaignsPage() {
  await connection();
  const home = await loadReviewerHome(await getReviewerId());

  return (
    <>
      <main className="mx-auto max-w-md px-4 py-4 sm:px-5 sm:py-8">
        <ReviewerHero
          account={home.account}
          availableCount={home.availableCount}
          totalRewardPoints={home.totalRewardPoints}
        />

        {home.account && home.dashboard ? (
          <ReviewerDashboardTabs
            campaignPanel={
              <ReviewerCampaignPanel
                campaigns={home.campaigns}
                availableCount={home.availableCount}
              />
            }
            historyPanel={<ReviewerHistoryPanel dashboard={home.dashboard} />}
            profilePanel={
              <ReviewerProfilePanel account={home.account} dashboard={home.dashboard} />
            }
          />
        ) : (
          <div className="mt-8">
            <ReviewerCampaignPanel
              campaigns={home.campaigns}
              availableCount={home.availableCount}
            />
          </div>
        )}
      </main>
      {home.account && <ReviewerLogoutButton />}
      <Footer />
    </>
  );
}
