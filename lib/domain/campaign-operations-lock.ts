import { prisma } from "@/lib/db";
import {
  CAMPAIGN_AUTOMATION_DISCOVERY_JOB,
  CAMPAIGN_AUTOMATION_SETUP_JOB,
} from "@/lib/domain/campaign-automation-jobs";

const ACTIVE_JOB_STATUSES = ["PENDING", "PROCESSING", "RETRY"];
const ACTIVE_RUN_STATUSES = ["QUEUED", "RUNNING"];
const ACTIVE_CAMPAIGN_STATUSES = ["QUEUED", "PROCESSING", "RETRY"];

type ActiveRun = { runKey: string; updatedAt: Date } | null;
type ActiveCampaign = { stage: string; updatedAt: Date } | null;

export interface CampaignOperationsLockReader {
  operationalJob: { count: (...args: unknown[]) => Promise<number> };
  automationRun: { findFirst: (...args: unknown[]) => Promise<ActiveRun> };
  campaignAutomationRun: {
    count: (...args: unknown[]) => Promise<number>;
    findFirst: (...args: unknown[]) => Promise<ActiveCampaign>;
  };
}

export interface CampaignOperationsAutomationLock {
  isLocked: boolean;
  activeJobCount: number;
  activeCampaignCount: number;
  runKey: string | null;
  stage: string | null;
  updatedAt: Date | null;
}

export async function getCampaignOperationsAutomationLock(
  db: CampaignOperationsLockReader = prisma as unknown as CampaignOperationsLockReader,
): Promise<CampaignOperationsAutomationLock> {
  const [activeJobCount, activeRun, activeCampaignCount, activeCampaign] = await Promise.all([
    db.operationalJob.count({
      where: {
        type: { in: [CAMPAIGN_AUTOMATION_DISCOVERY_JOB, CAMPAIGN_AUTOMATION_SETUP_JOB] },
        status: { in: ACTIVE_JOB_STATUSES },
      },
    }),
    db.automationRun.findFirst({
      where: { status: { in: ACTIVE_RUN_STATUSES } },
      orderBy: { updatedAt: "desc" },
      select: { runKey: true, updatedAt: true },
    }),
    db.campaignAutomationRun.count({
      where: { status: { in: ACTIVE_CAMPAIGN_STATUSES } },
    }),
    db.campaignAutomationRun.findFirst({
      where: { status: { in: ACTIVE_CAMPAIGN_STATUSES } },
      orderBy: { updatedAt: "desc" },
      select: { stage: true, updatedAt: true },
    }),
  ]);

  // Automation-run rows are retained as an operator history. A queued row can
  // remain after its job was completed or removed, so only a live queue job may
  // make the campaign management UI read-only.
  const isLocked = activeJobCount > 0;
  if (!isLocked) {
    return {
      isLocked: false,
      activeJobCount: 0,
      activeCampaignCount: 0,
      runKey: null,
      stage: null,
      updatedAt: null,
    };
  }

  return {
    isLocked: true,
    activeJobCount,
    activeCampaignCount,
    runKey: activeRun?.runKey ?? null,
    stage: activeCampaign?.stage ?? null,
    updatedAt: activeCampaign?.updatedAt ?? activeRun?.updatedAt ?? null,
  };
}

export async function isCampaignOperationsLocked() {
  return (await getCampaignOperationsAutomationLock()).isLocked;
}
