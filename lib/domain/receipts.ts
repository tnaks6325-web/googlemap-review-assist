import { sha256 } from "@/lib/crypto";

/** 동일 영수증 재사용 차단용 해시 (매장 + 코드) */
export const receiptDedupeHash = (businessId: string, code: string): string =>
  sha256(`${businessId}:${code.trim()}`);
