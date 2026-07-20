import { connection } from "next/server";
import {
  ReviewerCampaignPanel,
  ReviewerHistoryPanel,
  ReviewerProfilePanel,
} from "@/components/campaign/ReviewerDashboardPanels";
import { ReviewerDashboardTabs } from "@/components/campaign/ReviewerDashboardTabs";
import { ReviewerGuestDock } from "@/components/campaign/ReviewerGuestDock";
import { ReviewerHero } from "@/components/campaign/ReviewerHero";
import { ReviewerLandingArtwork } from "@/components/campaign/ReviewerLandingArtwork";
import { Footer } from "@/components/Footer";
import { ReviewerLogoutButton } from "@/components/auth/ReviewerLogoutButton";
import { getReviewerId } from "@/lib/auth/session";
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
      availableCount: availability.availableCount,
      totalRewardPoints: availability.totalRewardPoints,
    };
  }

  const availability = await getPublicCampaignAvailabilitySummary();
  return {
    account: null,
    dashboard: null,
    availableCount: availability.availableCount,
    totalRewardPoints: availability.totalRewardPoints,
  };
}

export default async function CampaignsPage() {
  await connection();
  const home = await loadReviewerHome(await getReviewerId());

  return (
    <>
      <main
        className={
          home.account
            ? "mx-auto min-h-dvh max-w-md px-4 py-4 sm:px-5 sm:py-8"
            : "mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-canvas shadow-[0_0_70px_rgba(42,60,84,0.16)] sm:my-6 sm:min-h-[calc(100dvh-48px)] sm:rounded-[30px]"
        }
      >
        <ReviewerHero
          account={home.account}
          availableCount={home.availableCount}
          totalRewardPoints={home.totalRewardPoints}
        />

        {home.account && home.dashboard ? (
          <ReviewerDashboardTabs
            campaignPanel={
              <ReviewerCampaignPanel
                availableCount={home.availableCount}
                totalRewardPoints={home.totalRewardPoints}
              />
            }
            historyPanel={<ReviewerHistoryPanel dashboard={home.dashboard} />}
            profilePanel={
              <ReviewerProfilePanel account={home.account} dashboard={home.dashboard} />
            }
          />
        ) : (
          <>
            <ReviewerLandingArtwork />
            <ReviewerGuestDock />
          </>
        )}
      </main>
      {home.account ? (
        <>
          <ReviewerLogoutButton />
          <Footer />
        </>
      ) : null}
    </>
  );
}
