import { describe, expect, it } from "vitest";
import { sendOtpSms, SmsProviderError } from "@/lib/sms";

describe("OTP SMS provider", () => {
  it("fails closed when production provider settings are absent", async () => {
    const previousProvider = process.env.SMS_PROVIDER;
    delete process.env.SMS_PROVIDER;
    await expect(sendOtpSms("01012345678", "123456")).rejects.toMatchObject({
      code: "SMS_NOT_CONFIGURED",
    } satisfies Partial<SmsProviderError>);
    if (previousProvider) process.env.SMS_PROVIDER = previousProvider;
  });
});
