import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateUniqueSlug } from "@/lib/domain/codes";
import { recordCampaignAutomationSetupFailure } from "@/lib/domain/operational-jobs";
import { upsertDailyCampaignAutomationRun } from "@/lib/domain/campaign-automation-state";

let sequence = 0;

async function createState() {
  const suffix = `${Date.now()}-${sequence++}`;
  const owner = await prisma.owner.create({ data: { email: `retry-${suffix}@example.com`, password: "x" } });
  const business = await prisma.business.create({ data: { ownerId: owner.id, name: `재시도 매장 ${suffix}` } });
  const campaign = await prisma.campaign.create({
    data: { businessId: business.id, slug: await generateUniqueSlug(), name: `재시도 캠페인 ${suffix}`, active: false },
  });
  const { run } = await upsertDailyCampaignAutomationRun(new Date(`2026-08-0${sequence}T08:00:00.000Z`));
  await prisma.campaignAutomationRun.create({ data: { automationRunId: run.id, campaignId: campaign.id, status: "PROCESSING" } });
  return { run, campaign };
}

describe("캠페인 자동화 재시도 상태", () => {
  it("일시 실패는 다음 재시도 시각과 RETRY 상태를 남긴다", async () => {
    const { run, campaign } = await createState();
    await recordCampaignAutomationSetupFailure({ payloadJson: JSON.stringify({ runId: run.id, campaignId: campaign.id }) }, false, new Error("timeout"));

    const state = await prisma.campaignAutomationRun.findUniqueOrThrow({
      where: { automationRunId_campaignId: { automationRunId: run.id, campaignId: campaign.id } },
    });
    expect(state).toMatchObject({ status: "RETRY", lastError: "timeout" });
    expect(state.nextRetryAt).toBeInstanceOf(Date);
  });

  it("최종 실패는 FAILED와 전체 DEGRADED 상태를 남긴다", async () => {
    const { run, campaign } = await createState();
    await recordCampaignAutomationSetupFailure({ payloadJson: JSON.stringify({ runId: run.id, campaignId: campaign.id }) }, true, new Error("provider failed"));

    const state = await prisma.campaignAutomationRun.findUniqueOrThrow({
      where: { automationRunId_campaignId: { automationRunId: run.id, campaignId: campaign.id } },
    });
    const parent = await prisma.automationRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(state).toMatchObject({ status: "FAILED", lastError: "provider failed" });
    expect(parent.status).toBe("DEGRADED");
  });
});
