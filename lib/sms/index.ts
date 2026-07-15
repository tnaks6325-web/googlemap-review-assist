import { SmsProviderError, sendNaverSensSms } from "@/lib/sms/naver-sens";

export { SmsProviderError };

export async function sendOtpSms(phone: string, code: string) {
  if (process.env.SMS_PROVIDER !== "naver-sens") {
    throw new SmsProviderError("SMS_NOT_CONFIGURED", "SMS 발송 서비스 설정이 필요합니다.", 503);
  }

  await sendNaverSensSms(phone, `[리뷰 작성 보조] 인증번호는 ${code}입니다. 3분 내 입력해주세요.`);
}
