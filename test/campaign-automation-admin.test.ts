import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateUniqueSlug } from "@/lib/domain/codes";
import { retryCampaignAutomationSetup } from "@/lib/domain/campaign-automation-admin";
import { CAMPAIGN_AUTOMATION_SETUP_JOB } from "@/lib/domain/campaign-automation-jobs";
import { upsertDailyCampaignAutomationRun } from "@/lib/domain/campaign-automation-state";

let sequence = 0;

async function createRetryableState() {
  const suffix = `${Date.now()}-${sequence++}`;
  const owner = await prisma.owner.create({
    data: { email: `automation-admin-${suffix}@example.com`, password: "x" },
  });
  const business = await prisma.business.create({
    data: { ownerId: owner.id, name: `관리자 재시도 매장 ${suffix}` },
  });
  const campaign = await prisma.campaign.create({
    data: {
      businessId: business.id,
      slug: await generateUniqueSlug(),
      name: `관리자 재시도 캠페인 ${suffix}`,
      active: false,
    },
  });
  const { run } = await upsertDailyCampaignAutomationRun(
    new Date(`2026-08-${String(sequence).padStart(2, "0")}T08:00:00.000Z`),
  );
  await prisma.campaignAutomationRun.create({
    data: {
      automationRunId: run.id,
      campaignId: campaign.id,
      status: "FAILED",
      stage: "FAILED",
      lastError: "provider timeout",
    },
  });
  const dedupeKey = `campaign-automation-setup:${run.runKey}:${campaign.id}`;
  await prisma.operationalJob.create({
    data: {
      type: CAMPAIGN_AUTOMATION_SETUP_JOB,
      dedupeKey,
      payloadJson: JSON.stringify({ runId: run.id, runKey: run.runKey, campaignId: campaign.id, sourceId: null }),
      status: "FAILED",
      attempts: 3,
      maxAttempts: 3,
      lastError: "provider timeout",
    },
  });
  return { campaign, run, dedupeKey };
}

describe("관리자 캠페인 자동화 재시도", () => {
  it("실패한 설정 작업을 새 대기 작업으로 안전하게 재예약한다", async () => {
    const { campaign, run, dedupeKey } = await createRetryableState();

    const result = await retryCampaignAutomationSetup(campaign.id);

    expect(result).toEqual({ runId: run.id, campaignId: campaign.id });
    await expect(
      prisma.campaignAutomationRun.findUniqueOrThrow({
        where: { automationRunId_campaignId: { automationRunId: run.id, campaignId: campaign.id } },
      }),
    ).resolves.toMatchObject({
      status: "QUEUED",
      stage: "RETRY_REQUESTED",
      attempts: 0,
      lastError: null,
      nextRetryAt: null,
      completedAt: null,
    });
    await expect(prisma.operationalJob.findUniqueOrThrow({ where: { dedupeKey } })).resolves.toMatchObject({
      status: "PENDING",
      attempts: 0,
      lastError: null,
      completedAt: null,
      lockedAt: null,
    });
  });

  it("이미 대기 또는 처리 중인 작업은 중복 재시도하지 않는다", async () => {
    const { campaign, dedupeKey } = await createRetryableState();
    await prisma.operationalJob.update({ where: { dedupeKey }, data: { status: "PROCESSING", lockedAt: new Date() } });

    await expect(retryCampaignAutomationSetup(campaign.id)).rejects.toMatchObject({ code: "AUTOMATION_IN_PROGRESS" });
  });
});
