import { enqueueCampaignSetup } from "@/lib/domain/campaign-automation-jobs";
import {
  processCampaignAutomationDiscovery,
  type CampaignAutomationDiscoveryInput,
} from "@/lib/domain/campaign-automation-discovery";
import { readCampaignAutomationSheetRows } from "@/lib/domain/campaign-automation-sheet-reader";
import { syncGoogleMapReviewCampaignRows } from "@/lib/domain/google-sheet-campaign-sync";
import type { SheetImportDryRunRow } from "@/lib/domain/google-sheet-import";
import { prisma } from "@/lib/db";

interface DiscoveryJobPayload {
  runId?: string;
  runKey?: string;
}

export async function processCampaignAutomationDiscoveryJob(
  job: { payloadJson: string },
  readRows: () => Promise<Pick<CampaignAutomationDiscoveryInput, "spreadsheetId" | "sheetName" | "rows">> = readCampaignAutomationSheetRows,
) {
  const payload = JSON.parse(job.payloadJson) as DiscoveryJobPayload;
  const runId = payload.runId?.trim();
  const runKey = payload.runKey?.trim();
  if (!runId || !runKey) throw new Error("Missing campaign automation discovery payload");

  await prisma.automationRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: new Date(), lastError: null },
  });
  const sheet = await readRows();
  const summary = await processCampaignAutomationDiscovery(
    { ...sheet, runId, runKey },
    {
      syncRow: async (row) => {
        const result = await syncGoogleMapReviewCampaignRows([row as SheetImportDryRunRow], {
          active: false,
          autoNaver: false,
          createNewCampaign: true,
        });
        const campaignId = result.campaignIds[0];
        if (!campaignId) throw new Error("Campaign import did not return a campaign id");
        return { campaignId };
      },
      enqueueSetup: enqueueCampaignSetup,
    },
  );
  if (summary.discovered === 0) {
    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: summary.invalid > 0 ? "DEGRADED" : "COMPLETED",
        completedAt: new Date(),
      },
    });
  }
  return summary;
}
