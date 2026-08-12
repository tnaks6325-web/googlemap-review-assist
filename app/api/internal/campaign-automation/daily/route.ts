import { startDailyCampaignAutomation } from "@/lib/domain/campaign-automation-trigger";
import { err, ok } from "@/lib/http";
import { authorizedInternalCronRequest } from "@/lib/internal-cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!authorizedInternalCronRequest(req)) {
    return err("UNAUTHORIZED", "작업 처리 권한이 없습니다.", 401);
  }
  if (process.env.CAMPAIGN_AUTOMATION_ENABLED !== "true") {
    return ok({ enabled: false, enqueued: false });
  }

  const result = await startDailyCampaignAutomation();
  return ok({
    enabled: true,
    enqueued: true,
    created: result.created,
    runKey: result.run.runKey,
    jobId: result.job.id,
  });
}
