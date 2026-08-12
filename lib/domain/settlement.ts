import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { runMoneyTx } from "@/lib/tx";

export const SETTLE_MIN = Number(process.env.SETTLE_MIN ?? "3000");
export const SETTLE_UNIT = Number(process.env.SETTLE_UNIT ?? "1000");

const METHODS = new Set(["BANK"]);
const ACCOUNT_SECRET =
  process.env.PAYOUT_ACCOUNT_SECRET ??
  process.env.SESSION_SECRET ??
  "dev-insecure-payout-account-secret";
const ACCOUNT_KEY = createHash("sha256").update(ACCOUNT_SECRET).digest();

export class SettlementError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface ReviewerPayoutAccountInput {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export interface ReviewerSettlementProfileInput {
  name: unknown;
  phone: unknown;
}

export interface ReviewerSettlementProfile {
  name: string | null;
  phone: string | null;
  email: string | null;
  settlementProfileRequired: boolean;
}

export interface ReviewerPayoutAccountView {
  bankName: string;
  accountNumber: string;
  accountLast4: string;
  maskedAccountNumber: string;
  accountHolder: string;
  updatedAt: Date;
}

export interface SettlementPayoutInfo {
  bankName: string;
  accountNumber: string;
  accountLast4: string;
  accountHolder: string;
}

function trimRequired(value: unknown, field: string, max: number): string {
  const text = String(value ?? "").trim();
  if (!text) throw new SettlementError("INVALID_PAYOUT", `${field}을 입력해 주세요`);
  if (text.length > max) throw new SettlementError("INVALID_PAYOUT", `${field}이 너무 깁니다`);
  return text;
}

function normalizeAccountNumber(value: unknown): string {
  const normalized = String(value ?? "").replace(/[^0-9]/g, "");
  if (normalized.length < 8 || normalized.length > 32) {
    throw new SettlementError("INVALID_PAYOUT", "계좌번호를 정확히 입력해 주세요");
  }
  return normalized;
}

function normalizeReviewerName(value: unknown): string {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) {
    throw new SettlementError("INVALID_PROFILE", "이름을 80자 이내로 입력해 주세요.");
  }
  return name;
}

function normalizeReviewerPhone(value: unknown): string {
  const phone = String(value ?? "").replace(/[^0-9]/g, "");
  if (!/^010\d{8}$/.test(phone)) {
    throw new SettlementError("INVALID_PROFILE", "연락처를 010-0000-0000 형식으로 입력해 주세요.");
  }
  return phone;
}

export function needsReviewerSettlementProfile(input: {
  name: string | null | undefined;
  phone: string | null | undefined;
  hasPayoutAccount: boolean;
}): boolean {
  return !input.name?.trim() || !input.phone?.trim() || !input.hasPayoutAccount;
}

function encryptAccountNumber(accountNumber: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ACCOUNT_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(accountNumber, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decryptAccountNumber(payload: string): string {
  if (!payload.startsWith("v1:")) return payload;
  const [, ivRaw, tagRaw, encryptedRaw] = payload.split(":");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new SettlementError("PAYOUT_DECRYPT_FAILED", "정산 계좌 정보를 확인할 수 없습니다", 500);
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      ACCOUNT_KEY,
      Buffer.from(ivRaw, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SettlementError("PAYOUT_DECRYPT_FAILED", "정산 계좌 정보를 확인할 수 없습니다", 500);
  }
}

/** Server-only: call only after an authenticated administrator authorization check. */
export function decodePayoutAccountNumber(accountNumberEnc: string): string {
  return decryptAccountNumber(accountNumberEnc);
}

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  return `${"*".repeat(Math.max(accountNumber.length - 4, 0))}${accountNumber.slice(-4)}`;
}

function toReviewerPayoutAccountView(account: {
  bankName: string;
  accountNumberEnc: string;
  accountLast4: string;
  accountHolder: string;
  updatedAt: Date;
}): ReviewerPayoutAccountView {
  const accountNumber = decryptAccountNumber(account.accountNumberEnc);
  return {
    bankName: account.bankName,
    accountNumber,
    accountLast4: account.accountLast4,
    maskedAccountNumber: maskAccountNumber(accountNumber),
    accountHolder: account.accountHolder,
    updatedAt: account.updatedAt,
  };
}

function buildSettlementPayoutInfo(account: {
  bankName: string;
  accountNumberEnc: string;
  accountLast4: string;
  accountHolder: string;
}): string {
  return JSON.stringify({
    bankName: account.bankName,
    accountNumberEnc: account.accountNumberEnc,
    accountLast4: account.accountLast4,
    accountHolder: account.accountHolder,
  });
}

export function decodeSettlementPayoutInfo(value: string | null | undefined): SettlementPayoutInfo | null {
  if (!value) return null;
  const raw = JSON.parse(value) as {
    bankName?: string;
    accountNumber?: string;
    accountNumberEnc?: string;
    accountLast4?: string;
    accountHolder?: string;
  };
  const accountNumber = raw.accountNumber ?? decryptAccountNumber(String(raw.accountNumberEnc ?? ""));
  return {
    bankName: String(raw.bankName ?? ""),
    accountNumber,
    accountLast4: String(raw.accountLast4 ?? accountNumber.slice(-4)),
    accountHolder: String(raw.accountHolder ?? ""),
  };
}

export async function upsertReviewerPayoutAccount(
  reviewerId: string,
  input: ReviewerPayoutAccountInput,
): Promise<ReviewerPayoutAccountView> {
  const bankName = trimRequired(input.bankName, "은행", 40);
  const accountHolder = trimRequired(input.accountHolder, "예금주", 40);
  const accountNumber = normalizeAccountNumber(input.accountNumber);
  const account = await prisma.reviewerPayoutAccount.upsert({
    where: { reviewerId },
    create: {
      reviewerId,
      bankName,
      accountNumberEnc: encryptAccountNumber(accountNumber),
      accountLast4: accountNumber.slice(-4),
      accountHolder,
    },
    update: {
      bankName,
      accountNumberEnc: encryptAccountNumber(accountNumber),
      accountLast4: accountNumber.slice(-4),
      accountHolder,
    },
  });
  return toReviewerPayoutAccountView(account);
}

export async function getReviewerPayoutAccount(
  reviewerId: string,
): Promise<ReviewerPayoutAccountView | null> {
  const account = await prisma.reviewerPayoutAccount.findUnique({ where: { reviewerId } });
  return account ? toReviewerPayoutAccountView(account) : null;
}

export async function getReviewerSettlementProfile(
  reviewerId: string,
): Promise<ReviewerSettlementProfile> {
  const reviewer = await prisma.reviewer.findUnique({
    where: { id: reviewerId },
    select: {
      name: true,
      phone: true,
      email: true,
      payoutAccount: { select: { id: true } },
    },
  });
  if (!reviewer) {
    throw new SettlementError("REVIEWER_NOT_FOUND", "리뷰어 정보를 찾을 수 없습니다.", 404);
  }

  return {
    name: reviewer.name,
    phone: reviewer.phone,
    email: reviewer.email,
    settlementProfileRequired: needsReviewerSettlementProfile({
      name: reviewer.name,
      phone: reviewer.phone,
      hasPayoutAccount: Boolean(reviewer.payoutAccount),
    }),
  };
}

export async function updateReviewerSettlementProfile(
  reviewerId: string,
  input: ReviewerSettlementProfileInput,
): Promise<ReviewerSettlementProfile> {
  const name = normalizeReviewerName(input.name);
  const phone = normalizeReviewerPhone(input.phone);

  try {
    const reviewer = await prisma.reviewer.update({
      where: { id: reviewerId },
      data: { name, phone },
      select: {
        name: true,
        phone: true,
        email: true,
        payoutAccount: { select: { id: true } },
      },
    });
    return {
      name: reviewer.name,
      phone: reviewer.phone,
      email: reviewer.email,
      settlementProfileRequired: needsReviewerSettlementProfile({
        name: reviewer.name,
        phone: reviewer.phone,
        hasPayoutAccount: Boolean(reviewer.payoutAccount),
      }),
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      throw new SettlementError("CONTACT_IN_USE", "이미 등록된 연락처입니다.", 409);
    }
    if (code === "P2025") {
      throw new SettlementError("REVIEWER_NOT_FOUND", "리뷰어 정보를 찾을 수 없습니다.", 404);
    }
    throw error;
  }
}

export async function getReviewerSettlementSummary(reviewerId: string) {
  const [wallet, settlements, payoutAccount, notifications, profile] = await Promise.all([
    prisma.pointWallet.findUnique({ where: { reviewerId }, select: { balance: true } }),
    prisma.settlement.findMany({
      where: { reviewerId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amount: true,
        method: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    getReviewerPayoutAccount(reviewerId),
    prisma.reviewerNotification.findMany({
      where: { reviewerId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
    }),
    getReviewerSettlementProfile(reviewerId),
  ]);

  return {
    availableBalance: wallet?.balance ?? 0,
    pendingAmount: settlements
      .filter((settlement) => settlement.status === "REQUESTED")
      .reduce((sum, settlement) => sum + settlement.amount, 0),
    paidAmount: settlements
      .filter((settlement) => settlement.status === "PAID")
      .reduce((sum, settlement) => sum + settlement.amount, 0),
    minAmount: SETTLE_MIN,
    unitAmount: SETTLE_UNIT,
    payoutAccount,
    profile,
    settlements,
    notifications,
  };
}

export async function requestSettlement(
  reviewerId: string,
  amount: number,
  method: string,
) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new SettlementError("INVALID_AMOUNT", "정산 금액이 올바르지 않습니다");
  }
  if (!METHODS.has(method)) {
    throw new SettlementError("INVALID_METHOD", "지원하지 않는 정산 수단입니다");
  }
  if (amount < SETTLE_MIN) {
    throw new SettlementError(
      "MIN_AMOUNT",
      `최소 정산 금액은 ${SETTLE_MIN.toLocaleString("ko-KR")}P 예요`,
    );
  }
  if (amount % SETTLE_UNIT !== 0) {
    throw new SettlementError(
      "INVALID_AMOUNT_UNIT",
      `${SETTLE_UNIT.toLocaleString("ko-KR")}P 단위로만 정산 신청할 수 있어요`,
    );
  }

  return runMoneyTx(async (tx) => {
    const [account, reviewer] = await Promise.all([
      tx.reviewerPayoutAccount.findUnique({ where: { reviewerId } }),
      tx.reviewer.findUnique({
        where: { id: reviewerId },
        select: { name: true, phone: true },
      }),
    ]);
    if (!account) {
      throw new SettlementError("PAYOUT_REQUIRED", "정산 계좌를 먼저 등록해 주세요", 422);
    }

    if (
      !reviewer ||
      needsReviewerSettlementProfile({
        name: reviewer.name,
        phone: reviewer.phone,
        hasPayoutAccount: true,
      })
    ) {
      throw new SettlementError("PROFILE_REQUIRED", "정산 기본 정보를 먼저 등록해 주세요.", 422);
    }

    const decremented = await tx.pointWallet.updateMany({
      where: { reviewerId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (decremented.count !== 1) {
      throw new SettlementError("INSUFFICIENT", "정산 가능한 적립금이 부족합니다");
    }

    const settlement = await tx.settlement.create({
      data: {
        reviewerId,
        amount,
        method,
        payoutInfo: buildSettlementPayoutInfo(account),
        status: "REQUESTED",
      },
    });
    await tx.pointTransaction.create({
      data: {
        reviewerId,
        type: "SETTLE",
        amount: -amount,
        settlementId: settlement.id,
        idempotencyKey: `settle:${settlement.id}`,
      },
    });

    const wallet = await tx.pointWallet.findUnique({ where: { reviewerId } });
    return {
      settlementId: settlement.id,
      status: settlement.status,
      amount,
      balance: wallet?.balance ?? 0,
    };
  });
}

/** Creates a pending bank settlement for an administrator-selected full balance. */
export async function createAdminSettlementForFullBalance(reviewerId: string, actor: string) {
  const cleanReviewerId = reviewerId.trim();
  if (!cleanReviewerId) throw new SettlementError("INVALID_REVIEWER", "리뷰어를 선택해 주세요.");

  return runMoneyTx(async (tx) => {
    const [account, reviewer, wallet, existing] = await Promise.all([
      tx.reviewerPayoutAccount.findUnique({ where: { reviewerId: cleanReviewerId } }),
      tx.reviewer.findUnique({ where: { id: cleanReviewerId }, select: { id: true } }),
      tx.pointWallet.findUnique({ where: { reviewerId: cleanReviewerId }, select: { balance: true } }),
      tx.settlement.findFirst({ where: { reviewerId: cleanReviewerId, status: "REQUESTED" }, select: { id: true } }),
    ]);
    if (!reviewer) throw new SettlementError("REVIEWER_NOT_FOUND", "리뷰어를 찾을 수 없습니다.", 404);
    if (!account) throw new SettlementError("PAYOUT_REQUIRED", "정산 계좌가 등록되지 않았습니다.", 422);
    if (existing) throw new SettlementError("PENDING_EXISTS", "이미 지급 대기 정산이 있습니다.", 409);
    const amount = wallet?.balance ?? 0;
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new SettlementError("NO_AVAILABLE_BALANCE", "정산할 보유 포인트가 없습니다.", 422);
    }
    const decremented = await tx.pointWallet.updateMany({
      where: { reviewerId: cleanReviewerId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (decremented.count !== 1) {
      throw new SettlementError("BALANCE_CHANGED", "보유 포인트가 변경되어 다시 확인해 주세요.", 409);
    }
    const settlement = await tx.settlement.create({
      data: {
        reviewerId: cleanReviewerId,
        amount,
        method: "BANK",
        payoutInfo: buildSettlementPayoutInfo(account),
        status: "REQUESTED",
        processedBy: actor,
      },
    });
    await tx.pointTransaction.create({
      data: {
        reviewerId: cleanReviewerId,
        type: "SETTLE",
        amount: -amount,
        settlementId: settlement.id,
        idempotencyKey: `admin-settle:${settlement.id}`,
        memo: "관리자 지급 대상 등록",
      },
    });
    return { settlementId: settlement.id, reviewerId: cleanReviewerId, amount };
  });
}

export async function processSettlement(
  settlementId: string,
  action: "approve" | "reject",
  actor: string,
) {
  return runMoneyTx(async (tx) => {
    const settlement = await tx.settlement.findUnique({ where: { id: settlementId } });
    if (!settlement) throw new SettlementError("NOT_FOUND", "정산 요청을 찾을 수 없습니다", 404);
    if (settlement.status !== "REQUESTED") {
      throw new SettlementError("BAD_STATE", "이미 처리된 정산입니다", 409);
    }

    if (action === "approve") {
      const updated = await tx.settlement.update({
        where: { id: settlement.id },
        data: { status: "PAID", processedBy: actor },
      });
      await tx.reviewerNotification.create({
        data: {
          reviewerId: settlement.reviewerId,
          type: "SETTLEMENT_PAID",
          title: "정산완료",
          body: `${settlement.amount.toLocaleString("ko-KR")}P 정산이 완료됐어요.`,
          metadataJson: JSON.stringify({ settlementId: settlement.id }),
        },
      });
      return { settlementId: settlement.id, status: updated.status };
    }

    await tx.pointTransaction.create({
      data: {
        reviewerId: settlement.reviewerId,
        type: "ADJUST",
        amount: settlement.amount,
        settlementId: settlement.id,
        idempotencyKey: `settle-reject:${settlement.id}`,
        memo: "정산 반려 복구",
      },
    });
    await tx.pointWallet.update({
      where: { reviewerId: settlement.reviewerId },
      data: { balance: { increment: settlement.amount } },
    });
    const updated = await tx.settlement.update({
      where: { id: settlement.id },
      data: { status: "REJECTED", processedBy: actor },
    });
    await tx.reviewerNotification.create({
      data: {
        reviewerId: settlement.reviewerId,
        type: "SETTLEMENT_REJECTED",
        title: "정산반려",
        body: `${settlement.amount.toLocaleString("ko-KR")}P 정산 신청이 반려됐어요. 적립금으로 복구됐습니다.`,
        metadataJson: JSON.stringify({ settlementId: settlement.id }),
      },
    });
    return { settlementId: settlement.id, status: updated.status };
  });
}
