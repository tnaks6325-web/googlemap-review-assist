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
});
