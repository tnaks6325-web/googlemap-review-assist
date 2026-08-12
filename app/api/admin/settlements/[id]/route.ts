import { Prisma } from "@prisma/client";
import { ok, err } from "@/lib/http";
import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { isAdminRequest } from "@/lib/auth/admin-guard";
import { processSettlement, SettlementError } from "@/lib/domain/settlement";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");
  if (action !== "approve" && action !== "reject") {
    return err("INVALID_ACTION", "approve 또는 reject 액션만 사용할 수 있어요");
  }

  if (action === "approve") {
    return err(
      "MANUAL_COMPLETION_DISABLED",
      "정산 완료는 하나은행 이체결과 파일을 업로드해 대조한 뒤에만 처리할 수 있습니다.",
      409,
    );
  }

  try {
    const result = await processSettlement(id, action, actor);
    return ok(result);
  } catch (e) {
    if (e instanceof SettlementError) return err(e.code, e.message, e.status);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return err("CONFLICT", "이미 처리된 요청입니다", 409);
    }
    throw e;
  }
}
