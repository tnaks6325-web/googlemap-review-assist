import { startDailyCampaignAutomation } from "@/lib/domain/campaign-automation-trigger";
import { isCampaignAutomationEnabled } from "@/lib/domain/campaign-automation-control";
import { err, ok } from "@/lib/http";
import { authorizedInternalCronRequest } from "@/lib/internal-cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!authorizedInternalCronRequest(req)) {
    return err("UNAUTHORIZED", "작업 처리 권한이 없습니다.", 401);
  }
  if (!(await isCampaignAutomationEnabled())) {
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
