import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  controlUpsert: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    campaignAutomationControl: { upsert: mocks.controlUpsert },
    operationalJob: { findMany: mocks.findMany, updateMany: mocks.updateMany },
  },
}));

import { setCampaignAutomationEnabled } from "@/lib/domain/campaign-automation-control";
import { campaignAutomationRunKey } from "@/lib/domain/campaign-automation-policy";

describe("global campaign automation control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.controlUpsert.mockResolvedValue({ enabled: true, updatedAt: new Date("2026-08-15T00:00:00.000Z") });
    mocks.findMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("resumes only today's discovery job that was paused by an administrator", async () => {
    await setCampaignAutomationEnabled(true);

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        dedupeKey: `campaign-automation-discovery:${campaignAutomationRunKey()}`,
        status: "COMPLETED",
        lastError: "Campaign automation paused by administrator",
      }),
      data: expect.objectContaining({ status: "PENDING", attempts: 0, completedAt: null, lastError: null }),
    }));
  });

  it("does not resume jobs when global automation is turned off", async () => {
    mocks.controlUpsert.mockResolvedValue({ enabled: false, updatedAt: new Date("2026-08-15T00:00:00.000Z") });

    await setCampaignAutomationEnabled(false);

    expect(mocks.updateMany).toHaveBeenCalledTimes(0);
  });
});
