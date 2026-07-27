import { prisma } from "@/lib/db";
import {
  CAMPAIGN_AUTOMATION_SETUP_JOB,
  type CampaignAutomationSetupPayload,
} from "@/lib/domain/campaign-automation-jobs";

const ACTIVE_JOB_STATUSES = ["PENDING", "RETRY", "PROCESSING"];
const RETRYABLE_AUTOMATION_STATUSES = ["NEEDS_REVIEW", "FAILED"];

export class CampaignAutomationAdminError extends Error {
  constructor(
    public readonly code:
      | "AUTOMATION_NOT_FOUND"
      | "AUTOMATION_IN_PROGRESS"
      | "AUTOMATION_NOT_RETRYABLE",
    message: string,
  ) {
    super(message);
    this.name = "CampaignAutomationAdminError";
  }
}

export interface AdminCampaignAutomationStatus {
  campaignId: string;
  campaignName: string;
  businessName: string;
  runKey: string;
  status: string;
  stage: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
}

export async function listAdminCampaignAutomationStatuses(): Promise<AdminCampaignAutomationStatus[]> {
  const states = await prisma.campaignAutomationRun.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      automationRun: { select: { runKey: true } },
      campaign: { select: { name: true, business: { select: { name: true } } } },
    },
  });
  const latestByCampaign = new Set<string>();

  return states.flatMap((state) => {
    if (latestByCampaign.has(state.campaignId)) return [];
    latestByCampaign.add(state.campaignId);
    return [{
      campaignId: state.campaignId,
      campaignName: state.campaign.name,
      businessName: state.campaign.business.name,
      runKey: state.automationRun.runKey,
      status: state.status,
      stage: state.stage,
      attempts: state.attempts,
      maxAttempts: state.maxAttempts,
      nextRetryAt: state.nextRetryAt,
      lastError: state.lastError,
      updatedAt: state.updatedAt,
    }];
  });
}

function setupJobDedupeKey(payload: CampaignAutomationSetupPayload) {
  return `campaign-automation-setup:${payload.runKey}:${payload.campaignId}`;
}

export async function retryCampaignAutomationSetup(campaignId: string) {
  const cleanCampaignId = campaignId.trim();
  if (!cleanCampaignId) {
    throw new CampaignAutomationAdminError("AUTOMATION_NOT_FOUND", "자동화 캠페인을 찾을 수 없습니다.");
  }

  return prisma.$transaction(async (tx) => {
    const state = await tx.campaignAutomationRun.findFirst({
      where: { campaignId: cleanCampaignId },
      orderBy: { createdAt: "desc" },
      include: { automationRun: { select: { id: true, runKey: true } } },
    });
    if (!state) {
      throw new CampaignAutomationAdminError("AUTOMATION_NOT_FOUND", "자동화 실행 이력이 없습니다.");
    }
    if (ACTIVE_JOB_STATUSES.includes(state.status)) {
      throw new CampaignAutomationAdminError("AUTOMATION_IN_PROGRESS", "자동화 작업이 이미 진행 중입니다.");
    }
    if (!RETRYABLE_AUTOMATION_STATUSES.includes(state.status)) {
      throw new CampaignAutomationAdminError("AUTOMATION_NOT_RETRYABLE", "현재 상태에서는 재시도할 수 없습니다.");
    }

    const payload: CampaignAutomationSetupPayload = {
      runId: state.automationRun.id,
      runKey: state.automationRun.runKey,
      campaignId: state.campaignId,
      sourceId: state.sourceId,
    };
    const dedupeKey = setupJobDedupeKey(payload);
    const existingJob = await tx.operationalJob.findUnique({ where: { dedupeKey } });
    if (existingJob && ACTIVE_JOB_STATUSES.includes(existingJob.status)) {
      throw new CampaignAutomationAdminError("AUTOMATION_IN_PROGRESS", "자동화 작업이 이미 예약되어 있습니다.");
    }

    const now = new Date();
    await tx.campaignAutomationRun.update({
      where: { id: state.id },
      data: {
        status: "QUEUED",
        stage: "RETRY_REQUESTED",
        attempts: 0,
        nextRetryAt: null,
        lockedAt: null,
        lastError: null,
        completedAt: null,
      },
    });
    await tx.automationRun.update({
      where: { id: state.automationRun.id },
      data: { status: "RUNNING", completedAt: null, lastError: null },
    });

    if (existingJob) {
      const reset = await tx.operationalJob.updateMany({
        where: { id: existingJob.id, status: { in: ["COMPLETED", "FAILED"] } },
        data: {
          status: "PENDING",
          payloadJson: JSON.stringify(payload),
          attempts: 0,
          maxAttempts: state.maxAttempts,
          runAt: now,
          lockedAt: null,
          lastError: null,
          completedAt: null,
        },
      });
      if (reset.count !== 1) {
        throw new CampaignAutomationAdminError("AUTOMATION_IN_PROGRESS", "자동화 작업 상태가 변경되어 재시도하지 않았습니다.");
      }
    } else {
      await tx.operationalJob.create({
        data: {
          type: CAMPAIGN_AUTOMATION_SETUP_JOB,
          dedupeKey,
          payloadJson: JSON.stringify(payload),
          maxAttempts: state.maxAttempts,
          runAt: now,
        },
      });
    }

    return { runId: state.automationRun.id, campaignId: state.campaignId };
  });
}
