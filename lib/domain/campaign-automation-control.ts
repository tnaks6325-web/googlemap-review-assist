import { prisma } from "@/lib/db";

const CONTROL_ID = "global";
const MANUAL_SETUP_RUN_PREFIX = "manual-campaign-setup";
const ACTIVE_JOB_STATUSES = ["PENDING", "RETRY"];

function environmentDefault() {
  return process.env.CAMPAIGN_AUTOMATION_ENABLED === "true";
}

export interface CampaignAutomationControlState {
  enabled: boolean;
  configured: boolean;
  updatedAt: Date | null;
}

export async function getCampaignAutomationControl(): Promise<CampaignAutomationControlState> {
  const control = await prisma.campaignAutomationControl.findUnique({ where: { id: CONTROL_ID } });
  return control
    ? { enabled: control.enabled, configured: true, updatedAt: control.updatedAt }
    : { enabled: environmentDefault(), configured: false, updatedAt: null };
}

export async function setCampaignAutomationEnabled(enabled: boolean) {
  const control = await prisma.campaignAutomationControl.upsert({
    where: { id: CONTROL_ID },
    create: { id: CONTROL_ID, enabled },
    update: { enabled },
  });

  if (!enabled) {
    const candidates = await prisma.operationalJob.findMany({
      where: {
        type: { in: ["CAMPAIGN_AUTOMATION_DISCOVERY", "CAMPAIGN_AUTOMATION_SETUP"] },
        status: { in: ACTIVE_JOB_STATUSES },
      },
      select: { id: true, type: true, payloadJson: true },
    });
    const automaticJobIds = candidates.flatMap((job) => {
      if (job.type === "CAMPAIGN_AUTOMATION_DISCOVERY") return [job.id];
      try {
        const payload = JSON.parse(job.payloadJson) as { runKey?: unknown };
        return typeof payload.runKey === "string" && payload.runKey.startsWith(MANUAL_SETUP_RUN_PREFIX)
          ? []
          : [job.id];
      } catch {
        return [job.id];
      }
    });
    if (automaticJobIds.length) {
      await prisma.operationalJob.updateMany({
        where: { id: { in: automaticJobIds }, status: { in: ACTIVE_JOB_STATUSES } },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lockedAt: null,
          lastError: "Campaign automation paused by administrator",
        },
      });
    }
  }

  return { enabled: control.enabled, configured: true, updatedAt: control.updatedAt };
}

export async function isCampaignAutomationEnabled() {
  return (await getCampaignAutomationControl()).enabled;
}

export function isManualCampaignAutomationRun(runKey: string | undefined) {
  return Boolean(runKey?.startsWith(MANUAL_SETUP_RUN_PREFIX));
}
