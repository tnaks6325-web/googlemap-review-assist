import { createHash, timingSafeEqual } from "crypto";
import { getAdminId } from "@/lib/auth/session";

/**
 * 관리자 요청 인증.
 * 1) 관리자 세션(실 계정) 우선.
 * 2) ADMIN_TOKEN 헤더(부트스트랩/자동화 폴백) — 상수시간 비교.
 */
export async function isAdminRequest(req: Request): Promise<boolean> {
  if (await getAdminId()) return true;

  const expected = process.env.ADMIN_TOKEN;
  const token = req.headers.get("x-admin-token");
  if (!expected || !token) return false;
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
