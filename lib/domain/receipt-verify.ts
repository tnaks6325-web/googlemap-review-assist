import type { OcrResult } from "@/lib/ocr/types";

export interface VerifyDecision {
  status: "VERIFIED" | "PENDING";
  reason?: string;
}

const CONFIDENCE_MIN = 0.6;
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * OCR 결과로 영수증 자동검증 여부 결정.
 * R4 대응: 승인번호·금액·신뢰도·가맹점 매칭이 충족될 때만 VERIFIED(즉시 적립 가능).
 * 그 외에는 PENDING으로 두어 자가신고만으로는 적립되지 않게 한다.
 */
export function decideReceiptStatus(r: OcrResult, businessName: string): VerifyDecision {
  if (!r.approvalNo) return { status: "PENDING", reason: "승인번호 미인식" };
  if (!r.amount || r.amount <= 0) return { status: "PENDING", reason: "금액 미인식" };
  if (r.confidence < CONFIDENCE_MIN) return { status: "PENDING", reason: "인식 신뢰도 낮음" };

  // R4/F5: 가맹점 검증 fail-closed. 짧은 상호(오탐 위험)는 자동검증 금지,
  // 매칭은 "영수증 상호 텍스트가 등록 상호를 포함"만 인정(역방향 부분일치 제거).
  if (!r.merchantName) return { status: "PENDING", reason: "가맹점명 미인식" };
  const a = norm(r.merchantName);
  const b = norm(businessName);
  if (b.length < 3) return { status: "PENDING", reason: "가맹점 확인 필요" };
  if (!a.includes(b)) {
    return { status: "PENDING", reason: "가맹점명 불일치" };
  }
  return { status: "VERIFIED" };
}
