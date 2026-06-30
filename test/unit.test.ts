import { describe, it, expect } from "vitest";
import { canonicalizeCode, receiptDedupeHash } from "@/lib/domain/receipts";
import { parseReceiptText } from "@/lib/ocr/parse";
import { decideReceiptStatus } from "@/lib/domain/receipt-verify";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { translate, messages } from "@/lib/i18n/messages";
import type { OcrResult } from "@/lib/ocr/types";

describe("receipt code canonicalization (R3)", () => {
  it("대소문자/공백/구분자 변형을 동일 코드로 정규화", () => {
    expect(canonicalizeCode("abc-123")).toBe("ABC123");
    expect(canonicalizeCode(" ABC 123 ")).toBe("ABC123");
    expect(canonicalizeCode("ABC123")).toBe("ABC123");
  });
  it("dedupeHash는 정규화 코드가 같으면 동일", () => {
    expect(receiptDedupeHash("biz1", "abc-123")).toBe(receiptDedupeHash("biz1", "ABC 123"));
    expect(receiptDedupeHash("biz1", "abc123")).not.toBe(receiptDedupeHash("biz2", "abc123"));
  });
});

describe("OCR 파서", () => {
  it("승인번호/금액/날짜/상호 추출", () => {
    const p = parseReceiptText("상호: 온기담은식당\n2026-06-29\n합계: 23,000\n승인번호: 12345678");
    expect(p.approvalNo).toBe("12345678");
    expect(p.amount).toBe(23000);
    expect(p.merchantName).toContain("온기담은식당");
    expect(p.fieldsFound).toBe(4);
  });
});

describe("decideReceiptStatus (fail-closed)", () => {
  const base: OcrResult = {
    approvalNo: "12345678",
    amount: 23000,
    merchantName: "온기담은식당",
    rawText: "",
    confidence: 0.9,
  };
  it("모두 충족 + 상호 포함 → VERIFIED", () => {
    expect(decideReceiptStatus(base, "온기담은식당").status).toBe("VERIFIED");
  });
  it("승인번호 없으면 PENDING", () => {
    expect(decideReceiptStatus({ ...base, approvalNo: undefined }, "온기담은식당").status).toBe("PENDING");
  });
  it("신뢰도 낮으면 PENDING", () => {
    expect(decideReceiptStatus({ ...base, confidence: 0.3 }, "온기담은식당").status).toBe("PENDING");
  });
  it("가맹점명 미인식이면 PENDING(fail-closed)", () => {
    expect(decideReceiptStatus({ ...base, merchantName: undefined }, "온기담은식당").status).toBe("PENDING");
  });
  it("가맹점 불일치 PENDING", () => {
    expect(decideReceiptStatus(base, "다른가게").status).toBe("PENDING");
  });
});

describe("i18n", () => {
  it("ko/en 사전 키가 일치", () => {
    expect(Object.keys(messages.ko).sort()).toEqual(Object.keys(messages.en).sort());
  });
  it("변수 치환", () => {
    expect(translate("ko", "balanceNow", { balance: "2,500" })).toContain("2,500");
    expect(translate("en", "ctaConfirm")).toBe("Confirm");
  });
  it("미존재 키는 키 자체 반환", () => {
    expect(translate("ko", "__missing__")).toBe("__missing__");
  });
});

describe("비밀번호 해시", () => {
  it("해시 검증 성공/실패", () => {
    const h = hashPassword("password123");
    expect(verifyPassword("password123", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
});
