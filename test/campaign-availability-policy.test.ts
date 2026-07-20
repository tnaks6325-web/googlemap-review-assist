import { describe, expect, it } from "vitest";
import {
  campaignAvailability,
  isEffectiveCampaignAssignment,
  kstDateKey,
  kstDayWindow,
  normalizeSheetDate,
} from "@/lib/domain/campaign-availability-policy";

describe("campaign availability policy", () => {
  it("normalizes supported Google Sheet date formats", () => {
    expect(normalizeSheetDate("2026. 7. 21.")).toBe("2026-07-21");
    expect(normalizeSheetDate("2026-07-21")).toBe("2026-07-21");
    expect(normalizeSheetDate("2026/7/5")).toBe("2026-07-05");
    expect(normalizeSheetDate("2026-02-30")).toBeNull();
    expect(normalizeSheetDate("-")).toBeNull();
  });

  it("uses Asia/Seoul midnight for date keys and day windows", () => {
    expect(kstDateKey(new Date("2026-07-20T14:59:59.999Z"))).toBe("2026-07-20");
    expect(kstDateKey(new Date("2026-07-20T15:00:00.000Z"))).toBe("2026-07-21");

    expect(kstDayWindow(new Date("2026-07-20T15:30:00.000Z"))).toEqual({
      start: new Date("2026-07-20T15:00:00.000Z"),
      end: new Date("2026-07-21T15:00:00.000Z"),
    });
  });

  it("applies inclusive operating dates and daily and total quotas", () => {
    const base = {
      active: true,
      startDate: "2026-07-21",
      endDate: "2026-07-25",
      totalQuota: 25,
      dailyQuota: 5,
      assignedCount: 2,
      assignedTodayCount: 2,
      sourceReady: true,
    };

    expect(campaignAvailability(base, new Date("2026-07-20T15:00:00.000Z"))).toEqual({
      isAvailableToday: true,
      availabilityReason: "AVAILABLE",
      remainingTodayCount: 3,
      remainingTotalCount: 23,
    });
    expect(
      campaignAvailability(
        { ...base, assignedTodayCount: 5 },
        new Date("2026-07-21T03:00:00.000Z"),
      ).availabilityReason,
    ).toBe("DAILY_QUOTA_REACHED");
    expect(
      campaignAvailability(
        { ...base, assignedCount: 25 },
        new Date("2026-07-21T03:00:00.000Z"),
      ).availabilityReason,
    ).toBe("TOTAL_QUOTA_REACHED");
    expect(
      campaignAvailability(base, new Date("2026-07-25T15:00:00.000Z")).availabilityReason,
    ).toBe("AFTER_END_DATE");
  });

  it("only releases an unsubmitted assignment after its five-minute expiry", () => {
    const expiresAt = new Date("2026-07-21T00:05:00.000Z");

    expect(
      isEffectiveCampaignAssignment(
        { status: "ASSIGNED", assignmentExpiresAt: expiresAt, reviewProofSubmittedAt: null },
        new Date("2026-07-21T00:04:59.999Z"),
      ),
    ).toBe(true);
    expect(
      isEffectiveCampaignAssignment(
        { status: "ASSIGNED", assignmentExpiresAt: expiresAt, reviewProofSubmittedAt: null },
        expiresAt,
      ),
    ).toBe(false);
    expect(
      isEffectiveCampaignAssignment(
        {
          status: "REJECTED",
          assignmentExpiresAt: expiresAt,
          reviewProofSubmittedAt: new Date("2026-07-21T00:04:00.000Z"),
        },
        new Date("2026-07-22T00:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isEffectiveCampaignAssignment(
        { status: "EXPIRED", assignmentExpiresAt: expiresAt, reviewProofSubmittedAt: null },
        new Date("2026-07-21T00:01:00.000Z"),
      ),
    ).toBe(false);
  });
});
