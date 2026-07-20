import Link from "next/link";
import { connection } from "next/server";
import { CampaignList } from "@/components/campaign/CampaignList";
import { ReviewerHero } from "@/components/campaign/ReviewerHero";
import { Footer } from "@/components/Footer";
import { ReviewerLogoutButton } from "@/components/auth/ReviewerLogoutButton";
import { getReviewerId } from "@/lib/auth/session";
import { listPublicCampaigns } from "@/lib/domain/operator-campaigns";
import {
  getPublicCampaignAvailabilitySummary,
  getReviewerCampaignAvailability,
} from "@/lib/domain/reviewer-campaigns";
import { getReviewerHomeAccount } from "@/lib/domain/reviewer-home";

export const runtime = "nodejs";

async function loadReviewerHome(reviewerId: string | null) {
  if (reviewerId) {
    const [account, availability] = await Promise.all([
      getReviewerHomeAccount(reviewerId),
      getReviewerCampaignAvailability(reviewerId),
    ]);
    return {
      account,
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

        <section aria-labelledby="campaign-list-title" className="mt-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-brand">GOOGLE MAPS CAMPAIGN</p>
              <h2 id="campaign-list-title" className="mt-1 text-xl font-bold text-ink">
                오늘 참여 가능한 캠페인
              </h2>
            </div>
            <span className="shrink-0 text-sm font-semibold text-ink-weak">
              {home.availableCount.toLocaleString("ko-KR")}개
            </span>
          </div>

          <div className="mb-4 flex items-center gap-3 text-sm">
            <Link href="/me" className="font-semibold text-brand">
              내 적립금
            </Link>
            <Link href="/legal/reviews" className="text-ink-weak hover:text-ink-sub">
              리뷰·적립 정책
            </Link>
          </div>

          <CampaignList campaigns={home.campaigns} />
        </section>
      </main>
      {home.account && <ReviewerLogoutButton />}
      <Footer />
    </>
  );
}
