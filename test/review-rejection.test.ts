import { describe, expect, it } from "vitest";
import { resolveReviewRejectionReason } from "@/lib/review-rejection";

describe("review rejection reason", () => {
  it("returns the fixed label for a predefined reason", () => {
    expect(resolveReviewRejectionReason("OTHER_STORE", "무시할 입력")).toEqual({
      ok: true,
      note: "타매장 리뷰가 제출되었음",
    });
    expect(resolveReviewRejectionReason("REVIEW_CONTENT_REVISION", null)).toEqual({
      ok: true,
      note: "리뷰내용 수정필요",
    });
  });

  it("requires a non-empty custom reason", () => {
    expect(resolveReviewRejectionReason("CUSTOM", "   ")).toEqual({
      ok: false,
      message: "상세 반려 사유를 입력해 주세요.",
    });
  });

  it("trims a custom reason and limits it to 500 characters", () => {
    expect(resolveReviewRejectionReason("CUSTOM", "  사진에 주문 내역이 보이지 않습니다.  ")).toEqual({
      ok: true,
      note: "사진에 주문 내역이 보이지 않습니다.",
    });
    expect(resolveReviewRejectionReason("CUSTOM", "가".repeat(501))).toEqual({
      ok: false,
      message: "상세 반려 사유는 500자 이내로 입력해 주세요.",
    });
  });

  it("rejects an unknown reason code", () => {
    expect(resolveReviewRejectionReason("UNKNOWN", null)).toEqual({
      ok: false,
      message: "반려 사유를 선택해 주세요.",
    });
  });
});
