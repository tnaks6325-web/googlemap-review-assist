import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { processCampaignAutomationDiscoveryJob } from "@/lib/domain/campaign-automation-discovery-worker";
import { upsertDailyCampaignAutomationRun } from "@/lib/domain/campaign-automation-state";

describe("신규 캠페인 발견 워커", () => {
  it("확정된 시트 신규 행을 비공개 캠페인과 세팅 작업으로 전환한다", async () => {
    const suffix = Date.now();
    const { run } = await upsertDailyCampaignAutomationRun(new Date("2026-08-03T08:00:00.000Z"));

    const result = await processCampaignAutomationDiscoveryJob(
      { payloadJson: JSON.stringify({ runId: run.id, runKey: run.runKey }) },
      async () => ({
        spreadsheetId: "sheet-integration",
        sheetName: "광고요청시트",
        rows: [{
          rowNumber: 6,
          status: "READY",
          receiptId: `CMP-worker-${suffix}`,
          advertiserName: `워커 광고주 ${suffix}`,
          businessName: `워커 매장 ${suffix}`,
          searchKeyword: "워커 매장",
          landingUrl: "https://maps.google.com/?cid=7788",
          startDate: "2026-08-03",
          endDate: "2026-08-31",
          totalQuota: 25,
          dailyQuota: 5,
          guide: "자동화 가이드",
          guideKeywords: ["자동화키워드"],
          examplePhrases: [],
          examplePhraseCount: 0,
          excludedDays: [],
          errors: [],
          warnings: [],
          googlePlace: {
            status: "RESOLVED",
            providerConfigured: true,
            input: "워커 매장",
            placeId: `ChIJ-worker-${suffix}`,
            name: `워커 매장 ${suffix}`,
            address: "서울 테스트로 1",
            url: "https://maps.google.com/?cid=7788",
            rating: 4.8,
            reviewCount: 10,
            matchConfidence: 100,
            message: null,
          },
        }],
      }),
    );

    expect(result).toMatchObject({ discovered: 1, invalid: 0 });
    const source = await prisma.sheetCampaignSource.findFirstOrThrow({ where: { receiptId: `CMP-worker-${suffix}` } });
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: source.campaignId! } });
    const job = await prisma.operationalJob.findFirstOrThrow({ where: { type: "CAMPAIGN_AUTOMATION_SETUP" } });
    expect(campaign.active).toBe(false);
    expect(job.status).toBe("PENDING");
  });
  it("creates a new campaign when the same place arrives with a new receipt ID", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const businessName = `restart business ${suffix}`;
    const placeId = `ChIJ-restart-${suffix}`;
    const row = (receiptId: string) => ({
      rowNumber: 6,
      status: "READY" as const,
      receiptId,
      advertiserName: `restart advertiser ${suffix}`,
      businessName,
      searchKeyword: businessName,
      landingUrl: "https://maps.google.com/?cid=8899",
      startDate: "2031-01-02",
      endDate: "2031-01-31",
      totalQuota: 5,
      dailyQuota: 1,
      guideKeywords: [],
      examplePhrases: [],
      googlePlace: {
        status: "RESOLVED" as const,
        placeId,
        name: businessName,
        address: "Seoul test-ro 1",
        url: "https://maps.google.com/?cid=8899",
        rating: 4.8,
        reviewCount: 10,
        matchConfidence: 100,
      },
    });
    const firstRun = await upsertDailyCampaignAutomationRun(new Date("2031-01-01T08:00:00.000Z"));
    const secondRun = await upsertDailyCampaignAutomationRun(new Date("2031-01-02T08:00:00.000Z"));

    await processCampaignAutomationDiscoveryJob(
      { payloadJson: JSON.stringify({ runId: firstRun.run.id, runKey: firstRun.run.runKey }) },
      async () => ({ spreadsheetId: "sheet-restart", sheetName: "campaigns", rows: [row(`CMP-restart-1-${suffix}`)] }),
    );
    const firstSource = await prisma.sheetCampaignSource.findFirstOrThrow({ where: { receiptId: `CMP-restart-1-${suffix}` } });
    await prisma.campaignAutomationRun.updateMany({ where: { campaignId: firstSource.campaignId! }, data: { status: "NEEDS_REVIEW" } });

    await processCampaignAutomationDiscoveryJob(
      { payloadJson: JSON.stringify({ runId: secondRun.run.id, runKey: secondRun.run.runKey }) },
      async () => ({ spreadsheetId: "sheet-restart", sheetName: "campaigns", rows: [row(`CMP-restart-2-${suffix}`)] }),
    );

    const sources = await prisma.sheetCampaignSource.findMany({
      where: { receiptId: { in: [`CMP-restart-1-${suffix}`, `CMP-restart-2-${suffix}`] } },
      orderBy: { receiptId: "asc" },
    });
    expect(sources).toHaveLength(2);
    expect(sources[0].campaignId).not.toBe(sources[1].campaignId);
    expect(await prisma.campaign.count({ where: { business: { googlePlaceId: placeId } } })).toBe(2);
  });
});
