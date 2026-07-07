import Link from "next/link";
import { Card } from "@/components/ui";
import type { PublicCampaignCard } from "@/lib/domain/operator-campaigns";

function formatRating(rating: number | null, reviewCount: number | null) {
  if (!rating) return "Google 정보 확인 중";
  return `${rating.toFixed(1)}★${reviewCount != null ? ` · 리뷰 ${reviewCount.toLocaleString("ko-KR")}개` : ""}`;
}

export function CampaignList({ campaigns }: { campaigns: PublicCampaignCard[] }) {
  if (!campaigns.length) {
    return (
      <Card className="text-center">
        <p className="font-semibold text-ink">진행 중인 캠페인이 없어요</p>
        <p className="mt-2 text-sm text-ink-weak">운영자가 Google Sheet 접수건을 검수하면 캠페인이 표시됩니다.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {campaigns.map((campaign) => (
        <Card key={campaign.id} className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-brand">{campaign.availabilityLabel}</p>
              <h2 className="mt-1 text-lg font-bold text-ink">{campaign.businessName}</h2>
              <p className="mt-1 text-sm text-ink-weak">
                {[campaign.category, campaign.address].filter(Boolean).join(" · ") || campaign.campaignName}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-brand-tint px-3 py-1 text-sm font-semibold text-brand">
              {campaign.rewardPoints.toLocaleString("ko-KR")}P
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-card bg-canvas p-3">
              <p className="text-xs text-ink-weak">Google</p>
              <p className="mt-1 font-semibold text-ink">{formatRating(campaign.rating, campaign.reviewCount)}</p>
            </div>
            <div className="rounded-card bg-canvas p-3">
              <p className="text-xs text-ink-weak">참여 완료</p>
              <p className="mt-1 font-semibold text-ink">{campaign.completedCount.toLocaleString("ko-KR")}건</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href={`/r/${campaign.slug}`}
              className="inline-flex h-[52px] flex-1 items-center justify-center rounded-btn bg-brand px-5 text-base font-medium text-white transition hover:bg-brand-pressed active:scale-[0.98]"
            >
              방문 참여하기
            </Link>
            <a
              href={campaign.googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[52px] items-center justify-center rounded-btn bg-brand-tint px-4 text-base font-medium text-brand transition hover:brightness-95 active:scale-[0.98]"
            >
              지도
            </a>
          </div>
          <p className="text-xs leading-5 text-ink-weak">
            적립은 플랫폼에서 원고를 복사한 뒤 Google 지도 등록 완료를 신고하면 처리됩니다.
          </p>
        </Card>
      ))}
    </div>
  );
}
