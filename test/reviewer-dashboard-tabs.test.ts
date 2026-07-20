import { describe, expect, it } from "vitest";
import {
  nextReviewerDashboardTab,
  type ReviewerDashboardTab,
} from "@/components/campaign/ReviewerDashboardTabs";

describe("reviewer dashboard tab keyboard navigation", () => {
  it("moves through tabs with arrow keys and wraps at both ends", () => {
    expect(nextReviewerDashboardTab("campaigns", "ArrowRight")).toBe("history");
    expect(nextReviewerDashboardTab("history", "ArrowRight")).toBe("profile");
    expect(nextReviewerDashboardTab("profile", "ArrowRight")).toBe("campaigns");
    expect(nextReviewerDashboardTab("campaigns", "ArrowLeft")).toBe("profile");
  });

  it("moves directly to the first or last tab with Home and End", () => {
    expect(nextReviewerDashboardTab("history", "Home")).toBe("campaigns");
    expect(nextReviewerDashboardTab("history", "End")).toBe("profile");
  });

  it("keeps the current tab for unrelated keys", () => {
    const current: ReviewerDashboardTab = "history";
    expect(nextReviewerDashboardTab(current, "Enter")).toBe(current);
  });
});
