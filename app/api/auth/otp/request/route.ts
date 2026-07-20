import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { sha256 } from "@/lib/crypto";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/auth/origin";
import { sendOtpSms, SmsProviderError } from "@/lib/sms";
import { recordOperationalError } from "@/lib/error-logging";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;
const DEV_OTP_CODE = "000000";
const normalizePhone = (p: string) => p.replace(/[^0-9]/g, "");
const devOtpEnabled = () => process.env.NODE_ENV !== "production" && process.env.OTP_DEV_BYPASS !== "0";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const body = await req.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (phone.length < 10 || phone.length > 11) {
    return err("INVALID_PHONE", "올바른 휴대폰 번호를 입력해 주세요");
  }

  const ip = clientIp(req);
  // IP·번호 레이트리밋 + 번호당 60초 최소 간격 (SECURITY_AUTH.md §5)
  const ipR = await rateLimit(`otp:req:ip:${ip}`, 20, HOUR);
  if (!ipR.ok) return err("RATE_LIMITED", "요청이 많아요. 잠시 후 다시 시도해 주세요", 429);
  const phoneHourR = await rateLimit(`otp:req:phone:${phone}`, 5, HOUR);
  if (!phoneHourR.ok) return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  const intervalR = await rateLimit(`otp:req:phone60:${phone}`, 1, 60 * 1000);
  if (!intervalR.ok) {
    return err("RATE_LIMITED", `${intervalR.retryAfterSec}초 후 다시 받아주세요`, 429);
  }

  const code = devOtpEnabled() ? DEV_OTP_CODE : String(Math.floor(100000 + Math.random() * 900000));
  const challenge = await prisma.otpChallenge.create({
    data: {
      phone,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + 3 * 60 * 1000),
    },
  });

  if (!devOtpEnabled()) {
    try {
      await sendOtpSms(phone, code);
    } catch (error) {
      await prisma.otpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
      await recordOperationalError({
        severity: "ERROR",
        source: "INTEGRATION",
        workflow: "휴대폰 인증",
        stage: "인증번호 문자 발송",
        code: error instanceof SmsProviderError ? error.code : "SMS_SEND_FAILED",
        title: "휴대폰 인증번호를 발송하지 못했습니다.",
        situation: "리뷰어가 로그인용 인증번호를 요청하던 중이었습니다.",
        cause: "문자 발송 서비스가 요청을 거부했거나 일시적으로 응답하지 않았습니다.",
        impact: "인증번호가 발송되지 않아 휴대폰 인증을 계속할 수 없습니다.",
        action: "문자 발송 서비스 설정과 잔액, 서비스 상태를 확인한 뒤 다시 요청해 주세요.",
        route: req.url,
        method: "POST",
        error,
      });
      if (error instanceof SmsProviderError) return err(error.code, error.message, error.status);
      return err("SMS_SEND_FAILED", "인증번호 문자 발송에 실패했습니다. 잠시 후 다시 시도해 주세요", 502);
    }
  }

  const payload: Record<string, unknown> = { requestId: challenge.id, expiresIn: 180 };
  // 실제 SMS 연동 전 로컬/테스트 진행용. 운영에서는 절대 노출하지 않는다.
  if (devOtpEnabled() || (process.env.NODE_ENV !== "production" && process.env.OTP_DEV_ECHO === "1")) {
    payload.devCode = code;
  }
  return ok(payload);
}
