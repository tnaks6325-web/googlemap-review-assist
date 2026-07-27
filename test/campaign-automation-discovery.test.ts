import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { enqueueCampaignAutomationDiscovery } from "@/lib/domain/campaign-automation-jobs";
import { processCampaignAutomationDiscovery } from "@/lib/domain/campaign-automation-discovery";
import { upsertDailyCampaignAutomationRun } from "@/lib/domain/campaign-automation-state";
import { generateUniqueSlug } from "@/lib/domain/codes";

let sequence = 0;

async function createCampaign() {
  const suffix = `${Date.now()}-${sequence++}`;
  const owner = await prisma.owner.create({ data: { email: `automation-${suffix}@example.com`, password: "x" } });
  const business = await prisma.business.create({ data: { ownerId: owner.id, name: `자동화 매장 ${suffix}` } });
  return prisma.campaign.create({
    data: { businessId: business.id, slug: await generateUniqueSlug(), name: `자동화 캠페인 ${suffix}`, active: false },
  });
}

describe("신규 캠페인 시트 발견 작업", () => {
  it("신규 READY 행만 비공개 캠페인 세팅 작업으로 전달하고, 같은 원본은 다시 전달하지 않는다", async () => {
    const { run } = await upsertDailyCampaignAutomationRun(new Date("2026-07-31T08:00:00.000Z"));
    const campaign = await createCampaign();
    await enqueueCampaignAutomationDiscovery(run);
    const syncRow = vi.fn(async () => ({ campaignId: campaign.id }));
    const enqueueSetup = vi.fn(async () => null);
    const row = {
      rowNumber: 6,
      status: "READY" as const,
      receiptId: `CMP-discovery-${Date.now()}`,
      advertiserName: "자동화 광고주",
      businessName: "자동화 매장",
      searchKeyword: "자동화 매장",
      landingUrl: "https://maps.google.com/?cid=123",
      startDate: "2026-07-31",
      endDate: "2026-08-10",
      totalQuota: 25,
      dailyQuota: 5,
      guideKeywords: ["자동화키워드"],
      examplePhrases: [],
      googlePlace: { status: "RESOLVED" as const, placeId: "ChIJautomation", name: "자동화 매장" },
    };

    const first = await processCampaignAutomationDiscovery(
      { runId: run.id, runKey: run.runKey, spreadsheetId: "sheet-1", sheetName: "광고요청시트", rows: [row] },
      { syncRow, enqueueSetup },
    );
    const second = await processCampaignAutomationDiscovery(
      { runId: run.id, runKey: run.runKey, spreadsheetId: "sheet-1", sheetName: "광고요청시트", rows: [{ ...row, rowNumber: 15 }] },
      { syncRow, enqueueSetup },
    );

    expect(first).toMatchObject({ discovered: 1, skipped: 0 });
    expect(second).toMatchObject({ discovered: 0, skipped: 1 });
    expect(syncRow).toHaveBeenCalledTimes(1);
    expect(enqueueSetup).toHaveBeenCalledTimes(1);
    const source = await prisma.sheetCampaignSource.findFirstOrThrow({ where: { receiptId: row.receiptId } });
    expect(source).toMatchObject({ campaignId: campaign.id, rowNumber: 15 });
    expect(await prisma.campaignAutomationRun.count({ where: { automationRunId: run.id, campaignId: campaign.id } })).toBe(1);
  });

  it("유효하지 않거나 Google Place가 확정되지 않은 행을 자동 세팅 큐에 넣지 않는다", async () => {
    const { run } = await upsertDailyCampaignAutomationRun(new Date("2026-08-01T08:00:00.000Z"));
    const syncRow = vi.fn(async () => ({ campaignId: "unused" }));
    const enqueueSetup = vi.fn(async () => null);

    const result = await processCampaignAutomationDiscovery(
      {
        runId: run.id,
        runKey: run.runKey,
        spreadsheetId: "sheet-1",
        sheetName: "광고요청시트",
        rows: [{
          rowNumber: 7,
          status: "ERROR",
          receiptId: `CMP-invalid-${Date.now()}`,
          advertiserName: "자동화 광고주",
          businessName: "",
          searchKeyword: "",
          landingUrl: "",
          startDate: "",
          endDate: "",
          totalQuota: null,
          dailyQuota: null,
          guideKeywords: [],
          examplePhrases: [],
          googlePlace: null,
        }],
      },
      { syncRow, enqueueSetup },
    );

    expect(result).toMatchObject({ discovered: 0, skipped: 1, invalid: 1 });
    expect(syncRow).not.toHaveBeenCalled();
    expect(enqueueSetup).not.toHaveBeenCalled();
  });
});
