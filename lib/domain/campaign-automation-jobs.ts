import { type AutomationRun, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const CAMPAIGN_AUTOMATION_DISCOVERY_JOB = "CAMPAIGN_AUTOMATION_DISCOVERY";
export const CAMPAIGN_AUTOMATION_SETUP_JOB = "CAMPAIGN_AUTOMATION_SETUP";

const DISCOVERY_MAX_ATTEMPTS = 4;
const SETUP_MAX_ATTEMPTS = 3;

type DbClient = typeof prisma | Prisma.TransactionClient;

export interface CampaignAutomationSetupPayload {
  runId: string;
  runKey: string;
  campaignId: string;
  sourceId: string | null;
}

export async function enqueueCampaignAutomationDiscovery(
  run: Pick<AutomationRun, "id" | "runKey">,
  db: DbClient = prisma,
) {
  return db.operationalJob.upsert({
    where: { dedupeKey: `campaign-automation-discovery:${run.runKey}` },
    create: {
      type: CAMPAIGN_AUTOMATION_DISCOVERY_JOB,
      dedupeKey: `campaign-automation-discovery:${run.runKey}`,
      payloadJson: JSON.stringify({ runId: run.id, runKey: run.runKey }),
      maxAttempts: DISCOVERY_MAX_ATTEMPTS,
    },
    update: {},
  });
}

export async function enqueueCampaignSetup(payload: CampaignAutomationSetupPayload, db: DbClient = prisma) {
  const cleanCampaignId = payload.campaignId.trim();
  if (!cleanCampaignId) throw new Error("Missing campaign automation campaign id");
  const cleanRunKey = payload.runKey.trim();
  if (!cleanRunKey) throw new Error("Missing campaign automation run key");

  return db.operationalJob.upsert({
    where: { dedupeKey: `campaign-automation-setup:${cleanRunKey}:${cleanCampaignId}` },
    create: {
      type: CAMPAIGN_AUTOMATION_SETUP_JOB,
      dedupeKey: `campaign-automation-setup:${cleanRunKey}:${cleanCampaignId}`,
      payloadJson: JSON.stringify({
        runId: payload.runId.trim(),
        runKey: cleanRunKey,
        campaignId: cleanCampaignId,
        sourceId: payload.sourceId?.trim() || null,
      }),
      maxAttempts: SETUP_MAX_ATTEMPTS,
    },
    update: {},
  });
}
