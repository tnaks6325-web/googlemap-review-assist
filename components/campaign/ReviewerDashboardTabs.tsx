"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

export type ReviewerDashboardTab = "campaigns" | "history" | "profile";

const TABS: Array<{ id: ReviewerDashboardTab; label: string }> = [
  { id: "campaigns", label: "캠페인" },
  { id: "history", label: "내 참여내역" },
  { id: "profile", label: "내 정보" },
];

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
    <div>
      <div
        role="tablist"
        aria-label="리뷰어 홈 메뉴"
        className="sticky top-3 z-20 mt-5 grid grid-cols-3 gap-1 rounded-[18px] border border-line bg-white/95 p-1.5 shadow-[0_8px_24px_rgba(25,36,54,0.08)] backdrop-blur"
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
              className={`min-h-11 rounded-[13px] px-2 text-[13px] font-bold transition ${
                selected
                  ? "bg-brand text-white shadow-[0_5px_14px_rgba(49,130,246,0.24)]"
                  : "text-ink-sub hover:bg-canvas hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

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
  );
}
