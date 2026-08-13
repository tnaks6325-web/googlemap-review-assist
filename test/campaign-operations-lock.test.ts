import { describe, expect, it } from "vitest";
import { getCampaignOperationsAutomationLock } from "@/lib/domain/campaign-operations-lock";

describe("campaign operations automation lock", () => {
  it("locks operations while a campaign automation job is pending and exposes the current stage", async () => {
    const state = await getCampaignOperationsAutomationLock({
      operationalJob: { count: async () => 2 },
      automationRun: {
        findFirst: async () => ({ runKey: "campaign-automation:2026-07-27", updatedAt: new Date("2026-07-27T08:05:00.000Z") }),
      },
      campaignAutomationRun: {
        count: async () => 1,
        findFirst: async () => ({ stage: "DRAFT_QUALITY", updatedAt: new Date("2026-07-27T08:14:00.000Z") }),
      },
    });

    expect(state).toMatchObject({
      isLocked: true,
      activeJobCount: 2,
      activeCampaignCount: 1,
      runKey: "campaign-automation:2026-07-27",
      stage: "DRAFT_QUALITY",
    });
  });

  it("unlocks operations when no active campaign automation work remains", async () => {
    const state = await getCampaignOperationsAutomationLock({
      operationalJob: { count: async () => 0 },
      automationRun: { findFirst: async () => null },
      campaignAutomationRun: { count: async () => 0, findFirst: async () => null },
    });

    expect(state).toEqual({
      isLocked: false,
      activeJobCount: 0,
      activeCampaignCount: 0,
      runKey: null,
      stage: null,
      updatedAt: null,
    });
  });

  it("does not let a stale queued automation history block operations after its job is gone", async () => {
    const state = await getCampaignOperationsAutomationLock({
      operationalJob: { count: async () => 0 },
      automationRun: {
        findFirst: async () => ({ runKey: "campaign-automation:stale", updatedAt: new Date("2026-08-14T00:00:00.000Z") }),
      },
      campaignAutomationRun: {
        count: async () => 1,
        findFirst: async () => ({ stage: "IMPORTING", updatedAt: new Date("2026-08-14T00:00:00.000Z") }),
      },
    });

    expect(state).toMatchObject({
      isLocked: false,
      activeJobCount: 0,
      activeCampaignCount: 0,
      runKey: null,
      stage: null,
    });
  });
});
