import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { sha256 } from "@/lib/crypto";
import { signReviewerSession, REVIEWER_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/auth/origin";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;
const DEV_OTP_CODE = "000000";
const DEV_REVIEWER_PHONE = "01000000000";
const normalizePhone = (p: string) => p.replace(/[^0-9]/g, "");
const devOtpEnabled = () => process.env.NODE_ENV !== "production" && process.env.OTP_DEV_BYPASS !== "0";
// R8: 실패 응답 단일화 (열거/구분 방지)
const FAIL = () => err("OTP_FAILED", "인증에 실패했어요. 다시 받아주세요", 401);

async function createReviewerSession(phone: string) {
  const reviewer = await prisma.reviewer.upsert({
    where: { phone },
    update: {},
    create: { phone, wallet: { create: {} } },
  });

  const res = ok({ reviewerId: reviewer.id });
  res.cookies.set(REVIEWER_COOKIE, signReviewerSession(reviewer.id), sessionCookieOptions);
  return res;
}

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const ip = clientIp(req);
  if (!rateLimit(`otp:verify:ip:${ip}`, 30, HOUR).ok) {
    return err("RATE_LIMITED", "요청이 많아요. 잠시 후 다시 시도해 주세요", 429);
  }

  const body = await req.json().catch(() => null);
  const requestId = String(body?.requestId ?? "");
  const code = String(body?.code ?? "");
  const fallbackPhone = normalizePhone(String(body?.phone ?? "")) || DEV_REVIEWER_PHONE;

  const ch = await prisma.otpChallenge.findUnique({ where: { id: requestId } });
  if (!ch || ch.consumed || ch.expiresAt < new Date() || ch.attempts >= 5) {
    if (devOtpEnabled() && code === DEV_OTP_CODE) {
      return createReviewerSession(fallbackPhone);
    }
    return FAIL();
  }

  // R5: IP와 무관한 번호 단위 검증 시도 카운터 (XFF 스푸핑·다중 챌린지 우회 방어)
  if (!rateLimit(`otp:verify:phone:${ch.phone}`, 10, HOUR).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  await prisma.otpChallenge.update({
    where: { id: ch.id },
    data: { attempts: { increment: 1 } },
  });
  if (sha256(code) !== ch.codeHash && !(devOtpEnabled() && code === DEV_OTP_CODE)) return FAIL();

  await prisma.otpChallenge.update({ where: { id: ch.id }, data: { consumed: true } });

  return createReviewerSession(ch.phone);
}
