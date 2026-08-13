import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateUniqueSlug } from "@/lib/domain/codes";
import {
  retryCampaignAutomationSetup,
  startManualCampaignSetup,
} from "@/lib/domain/campaign-automation-admin";
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
  it("creates one queued setup job when an admin manually starts a source-backed campaign setup", async () => {
    const { campaign } = await createRetryableState();
    await prisma.campaignAutomationRun.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.operationalJob.deleteMany({ where: { dedupeKey: { contains: campaign.id } } });
    await prisma.sheetCampaignSource.create({
      data: {
        sourceKey: `manual-source-${campaign.id}`,
        spreadsheetId: "test-sheet",
        sheetName: "campaigns",
        rowNumber: 1,
        sourceStatus: "READY",
        contentHash: `manual-source-${campaign.id}`,
        contentJson: "{}",
        campaignId: campaign.id,
      },
    });

    const result = await startManualCampaignSetup(campaign.id);

    expect(result).toMatchObject({ campaignId: campaign.id });
    expect(result.runKey).toMatch(new RegExp(`^manual-campaign-setup:${campaign.id}:`));
    await expect(
      prisma.campaignAutomationRun.findUniqueOrThrow({
        where: { automationRunId_campaignId: { automationRunId: result.runId, campaignId: campaign.id } },
      }),
    ).resolves.toMatchObject({ status: "QUEUED", stage: "MANUAL_REQUESTED" });
    await expect(
      prisma.operationalJob.findUniqueOrThrow({
        where: { dedupeKey: `campaign-automation-setup:${result.runKey}:${campaign.id}` },
      }),
    ).resolves.toMatchObject({ type: CAMPAIGN_AUTOMATION_SETUP_JOB, status: "PENDING", attempts: 0 });
  });

  it("rejects a manual setup request without a ready sheet campaign source", async () => {
    const { campaign } = await createRetryableState();
    await prisma.campaignAutomationRun.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.operationalJob.deleteMany({ where: { dedupeKey: { contains: campaign.id } } });

    await expect(startManualCampaignSetup(campaign.id)).rejects.toMatchObject({
      code: "CAMPAIGN_SOURCE_NOT_READY",
    });
  });

  it("creates a fresh status record when a completed manual setup is started again", async () => {
    const { campaign } = await createRetryableState();
    await prisma.campaignAutomationRun.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.operationalJob.deleteMany({ where: { dedupeKey: { contains: campaign.id } } });
    await prisma.sheetCampaignSource.create({
      data: {
        sourceKey: `manual-repeat-source-${campaign.id}`,
        spreadsheetId: "test-sheet",
        sheetName: "campaigns",
        rowNumber: 1,
        sourceStatus: "READY",
        contentHash: `manual-repeat-source-${campaign.id}`,
        contentJson: "{}",
        campaignId: campaign.id,
      },
    });

    const first = await startManualCampaignSetup(campaign.id);
    await prisma.campaignAutomationRun.update({
      where: { automationRunId_campaignId: { automationRunId: first.runId, campaignId: campaign.id } },
      data: { status: "READY", completedAt: new Date() },
    });
    const second = await startManualCampaignSetup(campaign.id);

    expect(second.runId).not.toBe(first.runId);
  });

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
