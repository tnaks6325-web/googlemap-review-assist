export const REVIEW_REJECTION_REASON_OPTIONS = [
  { code: "OTHER_STORE", label: "타매장 리뷰가 제출되었음" },
  { code: "REVIEW_CONTENT_REVISION", label: "리뷰내용 수정필요" },
  { code: "CUSTOM", label: "직접입력" },
] as const;

export type ReviewRejectionReasonCode =
  (typeof REVIEW_REJECTION_REASON_OPTIONS)[number]["code"];

type ReviewRejectionReasonResult =
  | { ok: true; note: string }
  | { ok: false; message: string };

export function resolveReviewRejectionReason(
  rawCode: unknown,
  rawCustomReason: unknown,
): ReviewRejectionReasonResult {
  if (rawCode === "OTHER_STORE" || rawCode === "REVIEW_CONTENT_REVISION") {
    const option = REVIEW_REJECTION_REASON_OPTIONS.find((item) => item.code === rawCode);
    return { ok: true, note: option!.label };
  }

  if (rawCode !== "CUSTOM") {
    return { ok: false, message: "반려 사유를 선택해 주세요." };
  }

  const customReason = typeof rawCustomReason === "string" ? rawCustomReason.trim() : "";
  if (!customReason) {
    return { ok: false, message: "상세 반려 사유를 입력해 주세요." };
  }
  if (customReason.length > 500) {
    return { ok: false, message: "상세 반려 사유는 500자 이내로 입력해 주세요." };
  }
  return { ok: true, note: customReason };
}
