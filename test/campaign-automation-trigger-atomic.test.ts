import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transactionClient = { transaction: "campaign-automation" };
  return {
    transactionClient,
    transaction: vi.fn(async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient)),
    upsertRun: vi.fn(),
    enqueueDiscovery: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/domain/campaign-automation-state", () => ({
  upsertDailyCampaignAutomationRun: mocks.upsertRun,
}));
vi.mock("@/lib/domain/campaign-automation-jobs", () => ({
  enqueueCampaignAutomationDiscovery: mocks.enqueueDiscovery,
}));

import { startDailyCampaignAutomation } from "@/lib/domain/campaign-automation-trigger";

describe("daily campaign automation trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsertRun.mockResolvedValue({ created: true, run: { id: "run-1", runKey: "NEW_CAMPAIGN_DAILY:2026-08-14" } });
    mocks.enqueueDiscovery.mockResolvedValue({ id: "job-1", status: "PENDING" });
  });

  it("creates the run and its discovery job in one transaction", async () => {
    const date = new Date("2026-08-14T08:00:00.000Z");

    const result = await startDailyCampaignAutomation(date);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.upsertRun).toHaveBeenCalledWith(date, mocks.transactionClient);
    expect(mocks.enqueueDiscovery).toHaveBeenCalledWith(
      { id: "run-1", runKey: "NEW_CAMPAIGN_DAILY:2026-08-14" },
      mocks.transactionClient,
    );
    expect(result).toMatchObject({ created: true, run: { id: "run-1" }, job: { id: "job-1" } });
  });
});
