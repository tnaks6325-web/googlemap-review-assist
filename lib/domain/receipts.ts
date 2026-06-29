import { sha256 } from "@/lib/crypto";

// R3: 코드 정규화 — 대문자 + 영숫자만. "abc-123", "ABC 123", " ABC123 " 등이
// 모두 동일 코드로 취급되어 재타이핑으로 dedupe를 우회하지 못하게 한다.
export const canonicalizeCode = (code: string): string =>
  code.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** 동일 영수증 재사용 차단용 해시 (매장 + 정규화 코드) */
export const receiptDedupeHash = (businessId: string, code: string): string =>
  sha256(`${businessId}:${canonicalizeCode(code)}`);
