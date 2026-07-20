import Link from "next/link";
import { CampaignList } from "@/components/campaign/CampaignList";
import { Card } from "@/components/ui";
import type { PublicCampaignCard } from "@/lib/domain/operator-campaigns";
import type {
  ReviewerHomeAccount,
  ReviewerHomeDashboard,
  ReviewerHomeParticipationItem,
} from "@/lib/domain/reviewer-home";
import { formatPhoneInput } from "@/lib/phone";

const PARTICIPATION_STATUS: Record<
  string,
  { label: string; className: string; pointLabel: string }
> = {
  ASSIGNED: {
    label: "참여 중",
    className: "bg-brand-tint text-brand",
    pointLabel: "예상 적립",
  },
  VERIFIED: {
    label: "참여 중",
    className: "bg-brand-tint text-brand",
    pointLabel: "예상 적립",
  },
  REVIEW_SUBMITTED: {
    label: "검수 대기",
    className: "bg-amber-50 text-amber-700",
    pointLabel: "승인 후 적립",
  },
  COMPLETED: {
    label: "적립 완료",
    className: "bg-success-tint text-emerald-700",
    pointLabel: "적립 포인트",
  },
  REJECTED: {
    label: "확인 필요",
    className: "bg-red-50 text-danger",
    pointLabel: "예상 적립",
  },
};

function formatParticipationDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function accountInitial(account: ReviewerHomeAccount) {
  return (account.name?.trim() || account.email?.trim() || "G").slice(0, 1).toUpperCase();
}

export function ReviewerCampaignPanel({
  campaigns,
  availableCount,
}: {
  campaigns: PublicCampaignCard[];
  availableCount: number;
}) {
  return (
    <section aria-labelledby="campaign-list-title">
      <div className="mb-4 flex items-end justify-between gap-4 px-1">
        <div>
          <p className="text-xs font-semibold text-brand">GOOGLE MAPS CAMPAIGN</p>
          <h2 id="campaign-list-title" className="mt-1 text-xl font-bold tracking-[-0.03em] text-ink">
            오늘 참여 가능한 캠페인
          </h2>
          <p className="mt-1 text-xs text-ink-weak">내 계정으로 참여할 수 있는 캠페인이에요.</p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-ink-weak">
          {availableCount.toLocaleString("ko-KR")}개
        </span>
      </div>
      <CampaignList campaigns={campaigns} />
    </section>
  );
}

function ParticipationCard({ item }: { item: ReviewerHomeParticipationItem }) {
  const status = PARTICIPATION_STATUS[item.status] ?? {
    label: item.status,
    className: "bg-canvas text-ink-sub",
    pointLabel: "예상 적립",
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-ink">{item.businessName}</h3>
          <p className="mt-1 text-xs text-ink-weak">
            {formatParticipationDate(item.occurredAt)} · {item.campaignName}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-bold ${status.className}`}>
          {status.label}
        </span>
      </div>

      {item.status === "REJECTED" && item.reviewNote && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-danger">
          {item.reviewNote}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-sm">
        <span className="text-ink-weak">{status.pointLabel}</span>
        <strong className={item.status === "COMPLETED" ? "text-success" : "text-ink"}>
          {item.status === "COMPLETED" ? "+" : ""}
          {item.rewardPoints.toLocaleString("ko-KR")}P
        </strong>
      </div>
    </Card>
  );
}

export function ReviewerHistoryPanel({
  dashboard,
}: {
  dashboard: ReviewerHomeDashboard;
}) {
  const { participation } = dashboard;

  return (
    <section aria-labelledby="participation-history-title">
      <div className="px-1">
        <h2 id="participation-history-title" className="text-xl font-bold tracking-[-0.03em] text-ink">
          내 참여내역
        </h2>
        <p className="mt-1 text-xs text-ink-weak">참여부터 검수와 적립까지 한눈에 확인해요.</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["전체 참여", participation.totalCount],
          ["검수 대기", participation.reviewPendingCount],
          ["적립 완료", participation.completedCount],
        ].map(([label, value]) => (
          <Card key={String(label)} className="px-2 py-4 text-center">
            <span className="block text-[11px] text-ink-weak">{label}</span>
            <strong className="mt-1.5 block text-lg text-ink">{Number(value).toLocaleString("ko-KR")}건</strong>
          </Card>
        ))}
      </div>

      {participation.items.length ? (
        <div className="mt-4 space-y-3">
          {participation.items.map((item) => (
            <ParticipationCard key={item.id} item={item} />
          ))}
          {participation.totalCount > participation.items.length && (
            <p className="py-2 text-center text-xs text-ink-weak">
              최근 {participation.items.length.toLocaleString("ko-KR")}건을 표시하고 있어요.
            </p>
          )}
        </div>
      ) : (
        <Card className="mt-4 py-10 text-center">
          <p className="font-semibold text-ink">아직 참여한 캠페인이 없어요</p>
          <p className="mt-2 text-sm text-ink-weak">캠페인 탭에서 첫 캠페인을 골라보세요.</p>
        </Card>
      )}
    </section>
  );
}

export function ReviewerProfilePanel({
  account,
  dashboard,
}: {
  account: ReviewerHomeAccount;
  dashboard: ReviewerHomeDashboard;
}) {
  const displayName = account.name?.trim() || "리뷰어";
  const phone = dashboard.profile.phone
    ? formatPhoneInput(dashboard.profile.phone)
    : "등록 필요";

  return (
    <section aria-labelledby="reviewer-profile-title">
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <h2 id="reviewer-profile-title" className="text-xl font-bold tracking-[-0.03em] text-ink">
            내 정보
          </h2>
          <p className="mt-1 text-xs text-ink-weak">로그인 계정과 정산 정보를 관리해요.</p>
        </div>
        <Link href="/me" className="text-xs font-bold text-brand">
          정보 수정
        </Link>
      </div>

      <Card className="mt-4 flex items-center gap-3 p-4">
        <div
          aria-label={`${displayName} Google 프로필`}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-tint text-base font-bold text-brand"
          role="img"
          style={
            account.avatarUrl
              ? {
                  backgroundImage: `url(${JSON.stringify(account.avatarUrl)})`,
                  backgroundPosition: "center",
                  backgroundSize: "cover",
                  color: "transparent",
                }
              : undefined
          }
        >
          {accountInitial(account)}
        </div>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-base text-ink">{displayName}</strong>
          <span className="mt-0.5 block truncate text-xs text-ink-sub">{account.email}</span>
        </div>
        <span className="shrink-0 rounded-full bg-success-tint px-2.5 py-1.5 text-[11px] font-bold text-emerald-700">
          로그인 중
        </span>
      </Card>

      <h3 className="mb-3 mt-6 px-1 text-sm font-bold text-ink">기본 및 정산 정보</h3>
      <Card className="overflow-hidden p-0">
        <ProfileRow label="연락처" value={phone} href="/me" />
        <ProfileRow
          label="정산 계좌"
          value={dashboard.profile.payoutAccountRegistered ? "등록 완료" : "등록 필요"}
          href="/me"
        />
        <ProfileRow
          label="보유 포인트"
          value={`${dashboard.points.balance.toLocaleString("ko-KR")}P`}
          href="/me"
        />
        <ProfileRow label="계정 관리" value="상단에서 계정 전환" />
      </Card>

      <div className="mt-3 rounded-[18px] bg-brand-tint p-4 text-xs leading-5 text-brand">
        정산계좌와 연락처는 로그인한 본인에게만 표시됩니다. Google 계정을 전환해도 각 계정의
        참여내역과 포인트는 따로 보관됩니다.
      </div>
    </section>
  );
}

function ProfileRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="w-[74px] shrink-0 text-ink-weak">{label}</span>
      <strong className="min-w-0 flex-1 truncate text-right text-ink">{value}</strong>
      {href && <span aria-hidden className="text-ink-weak">›</span>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="flex min-h-[62px] items-center gap-3 border-b border-line px-4 text-sm last:border-b-0 hover:bg-surface-alt"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="flex min-h-[62px] items-center gap-3 border-b border-line px-4 text-sm last:border-b-0">
      {content}
    </div>
  );
}
