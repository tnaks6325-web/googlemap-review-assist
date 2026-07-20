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

function CalendarCheckIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px] fill-none stroke-current">
      <rect x="4" y="5.5" width="16" height="14" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  );
}

function RewardIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px] fill-none stroke-current">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 8.5h4a2 2 0 0 1 0 4H9V7M9 12.5h4.5a2 2 0 0 1 0 4H9" />
    </svg>
  );
}

function MetricProgress({ filled, inverse = false }: { filled: number; inverse?: boolean }) {
  return (
    <div aria-hidden className="mt-2.5 flex gap-1">
      {[0, 1, 2, 3, 4].map((item) => (
        <span
          key={item}
          className={`h-1 w-3 rounded-full ${
            item < filled
              ? inverse
                ? "bg-[#75f0cf]"
                : "bg-brand"
              : inverse
                ? "bg-white/20"
                : "bg-[#d7e7fb]"
          }`}
        />
      ))}
    </div>
  );
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
      className="relative min-h-[430px] overflow-hidden bg-[radial-gradient(circle_at_92%_0%,rgba(132,205,255,0.5),transparent_17rem),radial-gradient(circle_at_0%_100%,rgba(20,74,190,0.4),transparent_15rem),linear-gradient(145deg,#0c5eda,#3d91fb)] px-5 pb-12 pt-[max(44px,env(safe-area-inset-top))] text-white sm:rounded-b-[30px]"
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.95)_1px,transparent_1px)] [background-size:20px_20px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]"
      />

      <div className="relative">
        <header className="pt-4 text-center">
          <p className="text-base font-bold tracking-[-0.02em] text-white/80">
            클릭 열번으로 끝내는 초간단 부업
          </p>
          <h1
            id="reviewer-home-title"
            className="mt-4 text-[40px] font-black leading-[1.08] tracking-[-0.065em]"
          >
            아이에이 플레이스
          </h1>
        </header>

        {account ? (
          <div className="mt-8 flex items-center gap-3 rounded-[18px] border border-white/20 bg-white/12 p-3 backdrop-blur-sm">
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
              <p className="text-[11px] font-semibold tracking-wide text-white/70">
                로그인된 Google 계정
              </p>
              <p className="mt-0.5 truncate text-sm font-bold">{displayName}</p>
              {account.email && <p className="truncate text-xs text-white/75">{account.email}</p>}
            </div>
            <ReviewerAccountSwitcher />
          </div>
        ) : null}

        <div className={`${account ? "mt-5" : "mt-[76px]"} grid grid-cols-2 gap-3`}>
          <article className="relative min-h-[142px] overflow-hidden rounded-[23px] border border-white/30 bg-[linear-gradient(150deg,#fff,#f4f8ff)] p-[15px] text-ink shadow-[0_16px_35px_rgba(5,53,125,0.16)]">
            <span aria-hidden className="absolute -bottom-9 -right-8 size-[84px] rounded-full bg-brand/8" />
            <div className="relative flex items-center justify-between">
              <span className="grid size-8 place-items-center rounded-[11px] bg-[#eaf3ff] text-brand [&_svg]:stroke-2 [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]">
                <CalendarCheckIcon />
              </span>
              <span className="text-[9px] font-black text-[#1a78ed]">TODAY</span>
            </div>
            <span className="relative mt-3 block text-[10px] font-extrabold text-[#718096]">
              오늘 참여 가능
            </span>
            <strong className="relative mt-1 block text-[27px] font-black leading-none tracking-[-0.05em]">
              {availableCount.toLocaleString("ko-KR")}
              <small className="ml-0.5 text-[13px]">개</small>
            </strong>
            <MetricProgress filled={Math.min(5, Math.max(1, availableCount))} />
          </article>

          <article className="relative min-h-[142px] overflow-hidden rounded-[23px] border border-white/25 bg-[linear-gradient(150deg,rgba(5,72,174,0.62),rgba(27,104,222,0.35))] p-[15px] text-white shadow-[inset_0_1px_rgba(255,255,255,0.18),0_16px_35px_rgba(5,53,125,0.12)] backdrop-blur-sm">
            <span aria-hidden className="absolute -bottom-9 -right-8 size-[84px] rounded-full bg-white/8" />
            <div className="relative flex items-center justify-between">
              <span className="grid size-8 place-items-center rounded-[11px] bg-white/15 text-white [&_svg]:stroke-2 [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]">
                <RewardIcon />
              </span>
              <span className="text-[9px] font-black text-white/75">REWARD</span>
            </div>
            <span className="relative mt-3 block text-[10px] font-extrabold text-white/75">
              받을 수 있는 포인트
            </span>
            <strong className="relative mt-1 block text-[27px] font-black leading-none tracking-[-0.05em]">
              {totalRewardPoints.toLocaleString("ko-KR")}
              <small className="ml-0.5 text-[13px]">P</small>
            </strong>
            <MetricProgress filled={Math.min(5, Math.max(1, Math.ceil(totalRewardPoints / 500)))} inverse />
          </article>
        </div>
      </div>
    </section>
  );
}
