import { createHash } from "crypto";

export interface HanaTransferExportRecord {
  settlementId: string;
  accountNumber: string;
  amount: number;
  accountHolder: string;
}

export interface HanaTransferConfirmationRow {
  account: unknown;
  amount: unknown;
  recipient: unknown;
  status: unknown;
}

export type HanaTransferMismatchReason =
  | "NOT_COMPLETED"
  | "ACCOUNT_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "RECIPIENT_MISMATCH";

const normalizeDigits = (value: unknown) => String(value ?? "").replace(/[^0-9]/g, "");
const normalizeName = (value: unknown) => String(value ?? "").replace(/\s+/g, "").trim();

const HANA_BANK_CODES: Record<string, string> = {
  경남: "039",
  광주: "034",
  국민: "004",
  기업: "003",
  농협: "011",
  부산: "032",
  산림조합: "064",
  산업: "002",
  새마을금고: "045",
  수협: "007",
  신한: "088",
  신협: "048",
  우리: "020",
  우체국: "071",
  저축: "050",
  전북: "037",
  제주: "035",
  카카오뱅크: "090",
  케이뱅크: "089",
  토스뱅크: "092",
  하나: "081",
  대구: "031",
  SC제일: "023",
  씨티: "027",
  HSBC: "054",
  iM뱅크: "031",
  KB증권: "218",
  NH투자증권: "247",
  미래에셋증권: "238",
  삼성증권: "240",
  한국투자증권: "243",
};

/** Returns the Hana code for a normalized Korean bank or securities-firm name. */
export function hanaBankCode(bankName: string): string | null {
  const normalized = normalizeName(bankName)
    .replace(/은행|증권|저축은행/g, "")
    .replace(/^KB국민$/, "국민")
    .replace(/^NH투자$/, "NH투자");
  if (HANA_BANK_CODES[normalized]) return HANA_BANK_CODES[normalized];
  const matches = Object.entries(HANA_BANK_CODES).filter(([name]) => normalized.includes(name));
  return matches.length === 1 ? matches[0][1] : null;
}

/** Stable, order-independent idempotency key for one requested bank transfer set. */
export function hanaTransferExportDedupeKey(settlementIds: string[]) {
  const normalized = [...new Set(settlementIds)].sort().join("\n");
  return `hana-transfer-export:${createHash("sha256").update(normalized).digest("hex")}`;
}

/**
 * Hana result files do not carry an application settlement ID. A duplicate
 * account/amount/recipient tuple would make a mixed success/failure result
 * impossible to assign safely, so it must not be exported.
 */
export function hasAmbiguousHanaTransferTarget(records: HanaTransferExportRecord[]) {
  const seen = new Set<string>();
  return records.some((record) => {
    const key = `${normalizeDigits(record.accountNumber)}:${record.amount}:${normalizeName(record.accountHolder)}`;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

function normalizeAmount(value: unknown): number | null {
  const digits = normalizeDigits(value);
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : null;
}

/** A result row can complete an exported settlement only when all fields agree. */
export function matchHanaTransferConfirmation(
  exported: HanaTransferExportRecord,
  row: HanaTransferConfirmationRow,
): { matched: true } | { matched: false; reason: HanaTransferMismatchReason } {
  if (normalizeName(row.status) !== "처리완료") return { matched: false, reason: "NOT_COMPLETED" };
  if (normalizeDigits(row.account) !== normalizeDigits(exported.accountNumber)) {
    return { matched: false, reason: "ACCOUNT_MISMATCH" };
  }
  if (normalizeAmount(row.amount) !== exported.amount) return { matched: false, reason: "AMOUNT_MISMATCH" };
  if (normalizeName(row.recipient) !== normalizeName(exported.accountHolder)) {
    return { matched: false, reason: "RECIPIENT_MISMATCH" };
  }
  return { matched: true };
}
