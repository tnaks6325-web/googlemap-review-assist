import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { signAdminSession, ADMIN_COOKIE, adminCookieOptions } from "@/lib/auth/session";
import { checkOrigin } from "@/lib/auth/origin";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;
const DEV_ADMIN_ID = "dev-admin";
// F6: 미존재 계정에도 동일 비용(scrypt)을 들여 타이밍 열거 차단
const DUMMY_HASH = hashPassword("invalid-account-placeholder");

function adminDevBypassEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.ADMIN_DEV_BYPASS !== "0";
}

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const ip = clientIp(req);
  if (!(await rateLimit(`admin:login:ip:${ip}`, 10, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const body = await req.json().catch(() => null);
  if (body?.devBypass === true) {
    if (!adminDevBypassEnabled()) {
      return err("DEV_BYPASS_DISABLED", "관리자 계정 로그인이 필요해요", 403);
    }

    const res = ok({ adminId: DEV_ADMIN_ID, devBypass: true });
    res.cookies.set(ADMIN_COOKIE, signAdminSession(DEV_ADMIN_ID), adminCookieOptions);
    return res;
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  // F2: 계정별 throttle(소스 IP와 무관하게 단일 계정 보호)
  if (!(await rateLimit(`admin:login:acct:${email}`, 10, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const admin = await prisma.admin.findUnique({ where: { email } });
  const valid = admin
    ? verifyPassword(password, admin.password)
    : (verifyPassword(password, DUMMY_HASH), false);
  if (!admin || !valid) {
    return err("LOGIN_FAILED", "이메일 또는 비밀번호가 올바르지 않아요", 401);
  }

  const res = ok({ adminId: admin.id });
  res.cookies.set(ADMIN_COOKIE, signAdminSession(admin.id), adminCookieOptions);
  return res;
}
