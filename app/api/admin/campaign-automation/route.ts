import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { getCampaignAutomationControl, setCampaignAutomationEnabled } from "@/lib/domain/campaign-automation-control";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  return ok(await getCampaignAutomationControl());
}

export async function PATCH(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") return err("INVALID_ENABLED", "자동 모드 값을 확인해 주세요.", 400);
  return ok(await setCampaignAutomationEnabled(body.enabled));
}
