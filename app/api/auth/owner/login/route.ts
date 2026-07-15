import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { signOwnerSession, OWNER_COOKIE, ownerCookieOptions } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/auth/origin";

export const runtime = "nodejs";

// F6: 미존재 계정에도 동일 비용으로 타이밍 열거 차단
const DUMMY_HASH = hashPassword("invalid-account-placeholder");

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const ip = clientIp(req);
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  // 계정+IP 시도 제한 (무차별 대입 완화)
  if (!(await rateLimit(`owner:login:ip:${ip}`, 20, 60 * 60 * 1000)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }
  // F2: 계정별 throttle(소스 IP 무관)
  if (!(await rateLimit(`owner:login:acct:${email}`, 10, 60 * 60 * 1000)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const owner = await prisma.owner.findUnique({ where: { email } });
  // 계정 존재 여부를 노출하지 않도록 동일 메시지 + 동일 비용(F6)
  const valid = owner
    ? verifyPassword(password, owner.password)
    : (verifyPassword(password, DUMMY_HASH), false);
  if (!owner || !valid) {
    return err("LOGIN_FAILED", "이메일 또는 비밀번호가 올바르지 않아요", 401);
  }

  const res = ok({ ownerId: owner.id });
  res.cookies.set(OWNER_COOKIE, signOwnerSession(owner.id), ownerCookieOptions);
  return res;
}
