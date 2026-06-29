import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { hashPassword } from "@/lib/auth/password";
import { signOwnerSession, OWNER_COOKIE, ownerCookieOptions } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/auth/origin";

export const runtime = "nodejs";

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const ip = clientIp(req);
  if (!rateLimit(`owner:signup:ip:${ip}`, 10, 60 * 60 * 1000).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!emailRe.test(email)) return err("INVALID_EMAIL", "올바른 이메일을 입력해 주세요");
  if (password.length < 8) return err("WEAK_PASSWORD", "비밀번호는 8자 이상이어야 해요");

  const existing = await prisma.owner.findUnique({ where: { email } });
  if (existing) return err("EMAIL_TAKEN", "이미 가입된 이메일이에요", 409);

  const owner = await prisma.owner.create({
    data: { email, password: hashPassword(password) },
  });

  const res = ok({ ownerId: owner.id });
  res.cookies.set(OWNER_COOKIE, signOwnerSession(owner.id), ownerCookieOptions);
  return res;
}
