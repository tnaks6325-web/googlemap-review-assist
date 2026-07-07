import { err, ok } from "@/lib/http";
import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { isAdminRequest } from "@/lib/auth/admin-guard";
import { processSettlement, SettlementError } from "@/lib/domain/settlement";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다", 403);

  const adminId = await getAdminId();
  let actor: string | null = adminId ? `admin:${adminId}` : null;
  if (!actor) {
    if (process.env.ADMIN_TOKEN_MONEY === "1" && (await isAdminRequest(req))) {
      actor = "token";
    } else {
      return err("FORBIDDEN", "관리자 로그인이 필요해요", 403);
    }
  }

  const body = await req.json().catch(() => null);
  const rawSettlementIds: unknown[] = Array.isArray(body?.settlementIds)
    ? body.settlementIds
    : [];
  const settlementIds = rawSettlementIds.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (!settlementIds.length) return err("INVALID_SELECTION", "정산완료 처리할 항목을 선택해 주세요");
  if (settlementIds.length > 100) return err("TOO_MANY_ITEMS", "한 번에 100건까지만 처리할 수 있어요");

  const processed: Array<{ settlementId: string; status: string }> = [];
  const failed: Array<{ settlementId: string; code: string; message: string }> = [];
  for (const settlementId of Array.from(new Set<string>(settlementIds))) {
    try {
      processed.push(await processSettlement(settlementId, "approve", actor));
    } catch (e) {
      if (e instanceof SettlementError) {
        failed.push({ settlementId, code: e.code, message: e.message });
      } else {
        throw e;
      }
    }
  }

  return ok({ processed, failed });
}
