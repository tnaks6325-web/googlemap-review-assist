import { getAdminId } from "@/lib/auth/session";
import { auditCampaignPreparedDraftRevisions } from "@/lib/domain/campaign-review-draft";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminId())) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  const result = await auditCampaignPreparedDraftRevisions();
  return ok(result);
}
