import { ReviewerGoogleSignIn } from "@/components/auth/ReviewerGoogleSignIn";
import { ReviewerAccountSwitcher } from "@/components/auth/ReviewerAccountSwitcher";
import type { ReviewerHomeAccount } from "@/lib/domain/reviewer-home";

interface ReviewerHeroProps {
  account: ReviewerHomeAccount | null;
  availableCount: number;
  totalRewardPoints: number;
}

function accountInitial(account: ReviewerHomeAccount) {
  return (account.name?.trim() || account.email?.trim() || "G").slice(0, 1).toUpperCase();
}

export function ReviewerHero({
  account,
  availableCount,
  totalRewardPoints,
}: ReviewerHeroProps) {
  const displayName = account?.name?.trim() || "리뷰어";

  return (
    <section
      aria-labelledby="reviewer-home-title"
      className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#1268e8_0%,#3182f6_52%,#6aa8ff_100%)] px-5 pb-6 pt-5 text-white shadow-[0_18px_45px_rgba(49,130,246,0.24)] sm:px-6 sm:pb-7 sm:pt-6"
    >
      <div
        aria-hidden
        className="absolute -right-12 -top-16 size-44 rounded-full bg-white/10 blur-sm"
      />
      <div
        aria-hidden
        className="absolute -bottom-20 -left-16 size-52 rounded-full bg-[#9fc7ff]/20 blur-lg"
      />

      <div className="relative">
        {account ? (
          <div className="flex items-center gap-3 rounded-[18px] border border-white/20 bg-white/12 p-3 backdrop-blur-sm">
            <div
              aria-label={`${displayName} Google 프로필`}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold text-brand shadow-sm"
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
              <p className="text-[11px] font-semibold tracking-wide text-white/70">로그인된 Google 계정</p>
              <p className="mt-0.5 truncate text-sm font-bold">{displayName}</p>
              {account.email && <p className="truncate text-xs text-white/75">{account.email}</p>}
            </div>
            <ReviewerAccountSwitcher />
          </div>
        ) : (
          <div className="rounded-[18px] border border-white/20 bg-white/12 p-4 backdrop-blur-sm">
            <div className="mb-3">
              <p className="text-sm font-bold">Google 계정으로 시작하세요</p>
              <p className="mt-1 text-xs leading-5 text-white/75">
                로그인하면 내 참여 이력을 반영한 캠페인을 보여드려요.
              </p>
            </div>
            <div className="rounded-[12px] bg-white p-1">
              <ReviewerGoogleSignIn />
            </div>
          </div>
        )}

        <div className="mt-7">
          <p className="text-xs font-semibold text-white/75">TODAY&apos;S REVIEW REWARD</p>
          <h1
            id="reviewer-home-title"
            className="mt-2 text-[28px] font-bold leading-[1.25] tracking-[-0.03em] sm:text-[32px]"
          >
            {account ? `${displayName}님,` : "오늘,"}
            <br />
            {account ? "오늘도 반가워요" : "참여할 캠페인을 골라보세요"}
          </h1>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-[20px] border border-white/25 bg-white px-4 py-4 text-ink shadow-sm">
            <p className="text-xs font-semibold text-ink-weak">오늘 참여 가능</p>
            <p className="mt-2 flex items-baseline gap-1">
              <span className="text-[30px] font-bold leading-none tracking-tight text-brand">
                {availableCount.toLocaleString("ko-KR")}
              </span>
              <span className="text-sm font-semibold text-ink-sub">개</span>
            </p>
          </div>
          <div className="rounded-[20px] border border-white/20 bg-[#0d5fd5]/55 px-4 py-4 shadow-sm backdrop-blur-sm">
            <p className="text-xs font-semibold text-white/70">받을 수 있는 포인트</p>
            <p className="mt-2 flex items-baseline gap-1">
              <span className="text-[30px] font-bold leading-none tracking-tight">
                {totalRewardPoints.toLocaleString("ko-KR")}
              </span>
              <span className="text-sm font-semibold text-white/75">P</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
