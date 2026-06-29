import { createHash, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { ok, err } from "@/lib/http";
import { checkOrigin } from "@/lib/auth/origin";
import { processSettlement, SettlementError } from "@/lib/domain/settlement";

export const runtime = "nodejs";

// 관리자 전용 — ADMIN_TOKEN 헤더로 보호(MVP). 정식 백오피스는 후속.
// R2: 상수시간 비교(해시 후 timingSafeEqual)로 타이밍 공격 차단.
function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  const token = req.headers.get("x-admin-token");
  if (!expected || !token) return false;
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  if (!isAdmin(req)) return err("FORBIDDEN", "권한이 없어요", 403);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "");
  if (action !== "approve" && action !== "reject") {
    return err("INVALID_ACTION", "approve 또는 reject 여야 해요");
  }

  try {
    const result = await processSettlement(id, action);
    return ok(result);
  } catch (e) {
    if (e instanceof SettlementError) return err(e.code, e.message, e.status);
    // 동시 중복 처리 등 — 깨끗한 409로 매핑(500 방지)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return err("CONFLICT", "이미 처리된 요청이에요", 409);
    }
    throw e;
  }
}
