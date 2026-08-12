import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { startDailyCampaignAutomation } from "@/lib/domain/campaign-automation-trigger";

describe("신규 캠페인 일일 트리거", () => {
  it("같은 KST 일자 trigger를 여러 번 호출해도 하나의 실행과 발견 작업만 남긴다", async () => {
    const date = new Date("2026-07-30T08:00:00.000Z");
    const first = await startDailyCampaignAutomation(date);
    const second = await startDailyCampaignAutomation(date);

    expect(first.run.id).toBe(second.run.id);
    expect(first.job.id).toBe(second.job.id);
    expect(first.job.status).toBe("PENDING");
    expect(await prisma.automationRun.count({ where: { runKey: first.run.runKey } })).toBe(1);
    expect(await prisma.operationalJob.count({ where: { dedupeKey: first.job.dedupeKey } })).toBe(1);
  });
});
