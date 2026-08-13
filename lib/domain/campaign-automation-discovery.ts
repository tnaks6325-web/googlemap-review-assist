import { enqueueCampaignSetup, type CampaignAutomationSetupPayload } from "@/lib/domain/campaign-automation-jobs";
import { upsertSheetCampaignSource } from "@/lib/domain/campaign-automation-state";
import { prisma } from "@/lib/db";

export interface CampaignAutomationDiscoveryRow {
  rowNumber: number;
  status: "READY" | "ERROR";
  receiptId?: string | null;
  advertiserName: string;
  businessName: string;
  searchKeyword: string;
  landingUrl: string;
  startDate: string;
  endDate: string;
  totalQuota: number | null;
  dailyQuota: number | null;
  guideKeywords: string[];
  examplePhrases: string[];
  googlePlace?: { status: "RESOLVED" | "MANUAL" | "FAILED" | "SKIPPED"; placeId: string | null; name: string | null } | null;
}

export interface CampaignAutomationDiscoveryInput {
  runId: string;
  runKey: string;
  spreadsheetId: string;
  sheetName: string;
  rows: CampaignAutomationDiscoveryRow[];
}

interface CampaignAutomationDiscoveryDependencies {
  syncRow: (row: CampaignAutomationDiscoveryRow, existingCampaignId?: string | null) => Promise<{ campaignId: string }>;
  enqueueSetup: (payload: CampaignAutomationSetupPayload) => Promise<unknown>;
}

function hasResolvedGooglePlace(row: CampaignAutomationDiscoveryRow) {
  return Boolean(row.googlePlace?.status === "RESOLVED" && row.googlePlace.placeId && row.googlePlace.name);
}

function rowPayload(row: CampaignAutomationDiscoveryRow) {
  return {
    status: row.status,
    businessName: row.businessName,
    searchKeyword: row.searchKeyword,
    landingUrl: row.landingUrl,
    startDate: row.startDate,
    endDate: row.endDate,
    totalQuota: row.totalQuota,
    dailyQuota: row.dailyQuota,
    guideKeywords: row.guideKeywords,
    examplePhrases: row.examplePhrases,
    googlePlace: row.googlePlace,
  };
}

export async function processCampaignAutomationDiscovery(
  input: CampaignAutomationDiscoveryInput,
  dependencies: CampaignAutomationDiscoveryDependencies,
) {
  const summary = { discovered: 0, skipped: 0, invalid: 0 };

  for (const row of input.rows) {
    const validForAutomation = row.status === "READY" && hasResolvedGooglePlace(row);
    const sourceResult = await upsertSheetCampaignSource({
      spreadsheetId: input.spreadsheetId,
      sheetName: input.sheetName,
      receiptId: row.receiptId,
      rowNumber: row.rowNumber,
      advertiserName: row.advertiserName,
      landingUrl: row.landingUrl,
      startDate: row.startDate,
      rowStatus: validForAutomation ? "READY" : "INVALID",
      rowPayload: rowPayload(row),
    });

    if (!validForAutomation) {
      summary.invalid += 1;
      summary.skipped += 1;
      continue;
    }
    if (sourceResult.change === "UNCHANGED" && sourceResult.source.campaignId) {
      summary.skipped += 1;
      continue;
    }

    const synced = await dependencies.syncRow(row, sourceResult.source.campaignId);
    const source = await prisma.sheetCampaignSource.update({
      where: { id: sourceResult.source.id },
      data: { campaignId: synced.campaignId },
    });
    await prisma.campaignAutomationRun.upsert({
      where: {
        automationRunId_campaignId: {
          automationRunId: input.runId,
          campaignId: synced.campaignId,
        },
      },
      create: {
        automationRunId: input.runId,
        campaignId: synced.campaignId,
        sourceId: source.id,
        stage: "IMPORTING",
        status: "QUEUED",
      },
      update: { sourceId: source.id, stage: "IMPORTING", status: "QUEUED", lastError: null },
    });
    await dependencies.enqueueSetup({
      runId: input.runId,
      runKey: input.runKey,
      campaignId: synced.campaignId,
      sourceId: source.id,
    });
    summary.discovered += 1;
  }

  return summary;
}

export const campaignAutomationDiscoveryDependencies = {
  enqueueSetup: enqueueCampaignSetup,
};
