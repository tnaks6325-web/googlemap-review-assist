import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateUniqueSlug } from "@/lib/domain/codes";
import { processCampaignAutomationSetupJob } from "@/lib/domain/operational-jobs";
import { upsertDailyCampaignAutomationRun } from "@/lib/domain/campaign-automation-state";

let sequence = 0;

async function createAutomationCampaign() {
  const suffix = `${Date.now()}-${sequence++}`;
  const owner = await prisma.owner.create({ data: { email: `worker-${suffix}@example.com`, password: "x" } });
  const business = await prisma.business.create({ data: { ownerId: owner.id, name: `워커 매장 ${suffix}` } });
  return prisma.campaign.create({
    data: { businessId: business.id, slug: await generateUniqueSlug(), name: `워커 캠페인 ${suffix}`, active: false },
  });
}

describe("캠페인 자동화 작업 워커", () => {
  it("수동 확인 결과를 캠페인별 상태에 저장하고 작업을 성공 종결한다", async () => {
    const { run } = await upsertDailyCampaignAutomationRun(new Date("2040-08-02T08:00:00.000Z"));
    await prisma.campaignAutomationRun.deleteMany({ where: { automationRunId: run.id } });
    await prisma.automationRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", completedAt: null, lastError: null },
    });
    const campaign = await createAutomationCampaign();
    await prisma.campaignAutomationRun.create({
      data: { automationRunId: run.id, campaignId: campaign.id, stage: "NAVER_LINKING", status: "PROCESSING" },
    });

    const result = await processCampaignAutomationSetupJob(
      {
        id: "job-1",
        payloadJson: JSON.stringify({ runId: run.id, campaignId: campaign.id }),
      },
      async () => ({ status: "NEEDS_REVIEW", reason: "NAVER_PLACE" }),
    );

    expect(result).toBe("NEEDS_REVIEW");
    const state = await prisma.campaignAutomationRun.findUniqueOrThrow({
      where: { automationRunId_campaignId: { automationRunId: run.id, campaignId: campaign.id } },
    });
    expect(state).toMatchObject({ status: "NEEDS_REVIEW", stage: "NAVER_PLACE" });
    expect(state.completedAt).toBeInstanceOf(Date);
    const parentRun = await prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(parentRun.status).toBe("DEGRADED");
  });
});
