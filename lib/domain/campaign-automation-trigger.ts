import { enqueueCampaignAutomationDiscovery } from "@/lib/domain/campaign-automation-jobs";
import { upsertDailyCampaignAutomationRun } from "@/lib/domain/campaign-automation-state";

export async function startDailyCampaignAutomation(date = new Date()) {
  const { run, created } = await upsertDailyCampaignAutomationRun(date);
  const job = await enqueueCampaignAutomationDiscovery(run);
  return { created, run, job };
}
