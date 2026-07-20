"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

export type ReviewerDashboardTab = "campaigns" | "history" | "profile";

const TABS: Array<{ id: ReviewerDashboardTab; label: string }> = [
  { id: "campaigns", label: "캠페인" },
  { id: "history", label: "참여내역" },
  { id: "profile", label: "내 정보" },
];

function TabIcon({ tab }: { tab: ReviewerDashboardTab }) {
  if (tab === "campaigns") {
    return (
      <svg aria-hidden viewBox="0 0 24 24">
        <path d="M3.5 10.5 12 3l8.5 7.5" />
        <path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" />
      </svg>
    );
  }
  if (tab === "history") {
    return (
      <svg aria-hidden viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20c.7-3.3 3-5 6.5-5s5.8 1.7 6.5 5" />
    </svg>
  );
}

export function nextReviewerDashboardTab(
  current: ReviewerDashboardTab,
  key: string,
): ReviewerDashboardTab {
  if (key === "Home") return TABS[0].id;
  if (key === "End") return TABS[TABS.length - 1].id;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return current;

  const currentIndex = TABS.findIndex((tab) => tab.id === current);
  const direction = key === "ArrowRight" ? 1 : -1;
  return TABS[(currentIndex + direction + TABS.length) % TABS.length].id;
}

interface ReviewerDashboardTabsProps {
  campaignPanel: ReactNode;
  historyPanel: ReactNode;
  profilePanel: ReactNode;
}

export function ReviewerDashboardTabs({
  campaignPanel,
  historyPanel,
  profilePanel,
}: ReviewerDashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<ReviewerDashboardTab>("campaigns");
  const panels: Record<ReviewerDashboardTab, ReactNode> = {
    campaigns: campaignPanel,
    history: historyPanel,
    profile: profilePanel,
  };

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const nextTab = nextReviewerDashboardTab(activeTab, event.key);
    if (nextTab === activeTab) return;

    event.preventDefault();
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById(`reviewer-tab-${nextTab}`)?.focus();
    });
  }

  return (
    <div className="flex min-h-[520px] flex-col">
      <div className="flex-1">
        {TABS.map((tab) => (
          <section
            key={tab.id}
            id={`reviewer-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`reviewer-tab-${tab.id}`}
            hidden={activeTab !== tab.id}
            className="mt-6"
          >
            {panels[tab.id]}
          </section>
        ))}
      </div>

      <div
        role="tablist"
        aria-label="리뷰어 주요 메뉴"
        className="sticky bottom-3 z-20 mt-6 grid grid-cols-3 gap-1 rounded-[20px] border border-line bg-white/95 p-1.5 shadow-[0_8px_28px_rgba(25,36,54,0.12)] backdrop-blur"
      >
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`reviewer-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-controls={`reviewer-panel-${tab.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={handleKeyDown}
              className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[14px] px-2 text-xs font-extrabold transition [&_svg]:size-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.9] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] ${
                selected
                  ? "bg-brand-tint text-brand"
                  : "text-ink-sub hover:bg-canvas hover:text-ink"
              }`}
            >
              <TabIcon tab={tab.id} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
