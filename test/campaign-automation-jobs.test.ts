import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  enqueueCampaignAutomationDiscovery,
  enqueueCampaignSetup,
} from "@/lib/domain/campaign-automation-jobs";
import { upsertDailyCampaignAutomationRun } from "@/lib/domain/campaign-automation-state";

describe("신규 캠페인 자동화 작업 등록", () => {
  it("일일 시트 발견 작업을 runKey당 한 번만 큐에 넣는다", async () => {
    const { run } = await upsertDailyCampaignAutomationRun(new Date("2026-07-28T08:00:00.000Z"));
    const first = await enqueueCampaignAutomationDiscovery(run);
    const second = await enqueueCampaignAutomationDiscovery(run);

    expect(second.id).toBe(first.id);
    expect(first.type).toBe("CAMPAIGN_AUTOMATION_DISCOVERY");
    expect(first.dedupeKey).toBe(`campaign-automation-discovery:${run.runKey}`);
    expect(await prisma.operationalJob.count({ where: { dedupeKey: first.dedupeKey } })).toBe(1);
  });

  it("같은 일일 실행과 캠페인 조합은 세팅 작업을 중복 등록하지 않는다", async () => {
    const { run } = await upsertDailyCampaignAutomationRun(new Date("2026-07-29T08:00:00.000Z"));
    const campaignId = `campaign-${Date.now()}`;
    const first = await enqueueCampaignSetup({ runId: run.id, runKey: run.runKey, campaignId, sourceId: "source-1" });
    const second = await enqueueCampaignSetup({ runId: run.id, runKey: run.runKey, campaignId, sourceId: "source-1" });

    expect(second.id).toBe(first.id);
    expect(first.type).toBe("CAMPAIGN_AUTOMATION_SETUP");
    expect(first.dedupeKey).toBe(`campaign-automation-setup:${run.runKey}:${campaignId}`);
  });
});
