import { Prisma } from "@prisma/client";
import { ok, err } from "@/lib/http";
import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { isAdminRequest } from "@/lib/auth/admin-guard";
import { processSettlement, SettlementError } from "@/lib/domain/settlement";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  // F1: money 액션은 실 관리자 세션 필수. 토큰 폴백은 ADMIN_TOKEN_MONEY=1일 때만 허용(감사 식별 'token').
  const adminId = await getAdminId();
  let actor: string | null = adminId ? `admin:${adminId}` : null;
  if (!actor) {
    if (process.env.ADMIN_TOKEN_MONEY === "1" && (await isAdminRequest(req))) {
      actor = "token";
    } else {
      return err("FORBIDDEN", "관리자 로그인이 필요해요", 403);
    }
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");
  if (action !== "approve" && action !== "reject") {
    return err("INVALID_ACTION", "approve 또는 reject 여야 해요");
  }

  try {
    const result = await processSettlement(id, action, actor);
    return ok(result);
  } catch (e) {
    if (e instanceof SettlementError) return err(e.code, e.message, e.status);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return err("CONFLICT", "이미 처리된 요청이에요", 409);
    }
    throw e;
  }
}
