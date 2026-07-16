import { describe, expect, it } from "vitest";
import { GoogleSheetsApiError, googleSheetsFailureMessage } from "@/lib/google-sheets";

describe("Google Sheets failure messages", () => {
  it("explains service account token failures without exposing the provider response", () => {
    const error = new GoogleSheetsApiError("invalid_grant: sensitive detail", 400, "token");

    expect(googleSheetsFailureMessage(error)).toBe(
      "Google 서비스 계정 인증에 실패했어요. GOOGLE_SHEETS_CLIENT_EMAIL과 GOOGLE_SHEETS_PRIVATE_KEY를 확인해 주세요."
    );
  });

  it("distinguishes Google Sheets access and API configuration failures", () => {
    const error = new GoogleSheetsApiError("permission denied", 403, "sheet");

    expect(googleSheetsFailureMessage(error)).toBe(
      "Google Sheets API를 활성화하고 광고 요청 시트를 서비스 계정 이메일에 뷰어 권한으로 공유해 주세요."
    );
  });

  it("identifies a missing spreadsheet or worksheet range", () => {
    const error = new GoogleSheetsApiError("not found", 404, "sheet");

    expect(googleSheetsFailureMessage(error)).toBe(
      "스프레드시트 ID 또는 시트 탭과 범위를 확인해 주세요."
    );
  });
});
