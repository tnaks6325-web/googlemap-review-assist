import { createHmac } from "node:crypto";

export class SmsProviderError extends Error {
  constructor(
    public readonly code: "SMS_NOT_CONFIGURED" | "SMS_SEND_FAILED",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SmsProviderError";
  }
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new SmsProviderError("SMS_NOT_CONFIGURED", "SMS 발송 서비스 설정이 필요합니다.", 503);
  return value;
}

export async function sendNaverSensSms(to: string, content: string) {
  const accessKey = required("NAVER_SENS_ACCESS_KEY");
  const secretKey = required("NAVER_SENS_SECRET_KEY");
  const serviceId = required("NAVER_SENS_SERVICE_ID");
  const from = required("NAVER_SENS_SENDER");
  const timestamp = String(Date.now());
  const path = `/sms/v2/services/${encodeURIComponent(serviceId)}/messages`;
  const signature = createHmac("sha256", secretKey)
    .update(`POST ${path}\n${timestamp}\n${accessKey}`)
    .digest("base64");

  let response: Response;
  try {
    response = await fetch(`https://sens.apigw.ntruss.com${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "x-ncp-apigw-timestamp": timestamp,
        "x-ncp-iam-access-key": accessKey,
        "x-ncp-apigw-signature-v2": signature,
      },
      body: JSON.stringify({ type: "SMS", from, to: [to], content }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new SmsProviderError("SMS_SEND_FAILED", "인증번호 문자 발송에 실패했습니다. 잠시 후 다시 시도해주세요.", 502);
  }

  if (!response.ok) {
    throw new SmsProviderError("SMS_SEND_FAILED", "인증번호 문자 발송에 실패했습니다. 잠시 후 다시 시도해주세요.", 502);
  }
}
