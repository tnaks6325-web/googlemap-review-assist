import { enqueueCampaignAutomationDiscovery } from "@/lib/domain/campaign-automation-jobs";
import { upsertDailyCampaignAutomationRun } from "@/lib/domain/campaign-automation-state";
import { prisma } from "@/lib/db";

export async function startDailyCampaignAutomation(date = new Date()) {
  // A queued AutomationRun with no matching OperationalJob is only safe while
  // both records are uncommitted. Keeping their creation in one transaction
  // prevents admin mutations from slipping through between those two writes.
  return prisma.$transaction(async (tx) => {
    const { run, created } = await upsertDailyCampaignAutomationRun(date, tx);
    const job = await enqueueCampaignAutomationDiscovery(run, tx);
    return { created, run, job };
  });
}
