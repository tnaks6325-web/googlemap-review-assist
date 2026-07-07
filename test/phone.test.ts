import { describe, expect, it } from "vitest";
import { formatPhoneInput, isFixedKoreanMobilePhone } from "@/lib/phone";

describe("phone input formatting", () => {
  it("formats typed digits as 010-0000-0000", () => {
    expect(formatPhoneInput("010")).toBe("010");
    expect(formatPhoneInput("0101")).toBe("010-1");
    expect(formatPhoneInput("0101234")).toBe("010-1234");
    expect(formatPhoneInput("01012345678")).toBe("010-1234-5678");
  });

  it("normalizes pasted values and caps the display at 11 digits", () => {
    expect(formatPhoneInput("010-1234-5678")).toBe("010-1234-5678");
    expect(formatPhoneInput("010 1234 5678 extra")).toBe("010-1234-5678");
    expect(formatPhoneInput("0101234567899")).toBe("010-1234-5678");
  });

  it("accepts only complete 010 mobile numbers", () => {
    expect(isFixedKoreanMobilePhone("010-1234-5678")).toBe(true);
    expect(isFixedKoreanMobilePhone("010-1234-567")).toBe(false);
    expect(isFixedKoreanMobilePhone("011-1234-5678")).toBe(false);
  });
});
