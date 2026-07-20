import { ReviewerGoogleSignIn } from "@/components/auth/ReviewerGoogleSignIn";

function CampaignIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24">
      <path d="M3.5 10.5 12 3l8.5 7.5" />
      <path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20c.7-3.3 3-5 6.5-5s5.8 1.7 6.5 5" />
    </svg>
  );
}

const GUEST_TABS = [
  { label: "캠페인", icon: <CampaignIcon />, active: true },
  { label: "참여내역", icon: <HistoryIcon />, active: false },
  { label: "내 정보", icon: <ProfileIcon />, active: false },
];

export function ReviewerGuestDock() {
  return (
    <section
      aria-label="로그인과 리뷰어 주요 메뉴"
      className="mt-auto border-t border-line bg-white/95 px-[13px] pb-[max(10px,env(safe-area-inset-bottom))] pt-3.5 shadow-[0_-14px_34px_rgba(36,54,78,0.08)] backdrop-blur-lg"
    >
      <div className="mx-auto mb-3 w-full max-w-[360px] px-1">
        <p className="mb-2 text-center text-[11px] leading-[1.45] text-ink-weak">
          로그인하면 참여 이력과 포인트를 이어서 확인할 수 있어요.
        </p>
        <ReviewerGoogleSignIn />
      </div>

      <nav
        aria-label="리뷰어 주요 메뉴"
        className="grid grid-cols-3 gap-1 border-t border-[#edf0f4] pt-2.5"
      >
        {GUEST_TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            aria-current={tab.active ? "page" : undefined}
            aria-disabled={!tab.active}
            className={`flex min-h-[57px] flex-col items-center justify-center gap-1 rounded-[14px] text-xs font-extrabold tracking-[-0.01em] ${
              tab.active ? "bg-[#edf5ff] text-[#1769df]" : "text-[#5f6e82]"
            } [&_svg]:size-[22px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.9] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
