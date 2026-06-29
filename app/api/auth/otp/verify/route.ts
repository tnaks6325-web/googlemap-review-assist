import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { sha256 } from "@/lib/crypto";
import { signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const requestId = String(body?.requestId ?? "");
  const code = String(body?.code ?? "");

  const ch = await prisma.otpChallenge.findUnique({ where: { id: requestId } });
  if (!ch || ch.consumed || ch.expiresAt < new Date()) {
    return err("OTP_INVALID", "인증번호가 만료되었어요. 다시 받아주세요", 401);
  }
  if (ch.attempts >= 5) {
    return err("OTP_LOCKED", "시도 횟수를 초과했어요. 다시 받아주세요", 429);
  }
  await prisma.otpChallenge.update({
    where: { id: ch.id },
    data: { attempts: { increment: 1 } },
  });
  if (sha256(code) !== ch.codeHash) {
    return err("OTP_MISMATCH", "인증번호가 일치하지 않아요", 401);
  }
  await prisma.otpChallenge.update({ where: { id: ch.id }, data: { consumed: true } });

  const reviewer = await prisma.reviewer.upsert({
    where: { phone: ch.phone },
    update: {},
    create: { phone: ch.phone, wallet: { create: {} } },
  });

  const res = ok({ reviewerId: reviewer.id });
  res.cookies.set(SESSION_COOKIE, signSession(reviewer.id), sessionCookieOptions);
  return res;
}
