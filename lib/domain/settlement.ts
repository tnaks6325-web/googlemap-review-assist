import { prisma } from "@/lib/db";

export const SETTLE_MIN = Number(process.env.SETTLE_MIN ?? "5000");
const METHODS = new Set(["BANK"]);

export class SettlementError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * 정산 요청.
 * R1: 잔액 게이트를 원자적 조건부 차감으로 구현 — `UPDATE ... WHERE balance >= amount`가
 * 1행을 감소시킨 경우에만 진행. 동시 요청은 두 번째 UPDATE의 WHERE가 실패(count=0)하여
 * 음수 잔액(이중지출)이 발생하지 않는다. (read-then-check TOCTOU 제거)
 */
export async function requestSettlement(
  reviewerId: string,
  amount: number,
  method: string,
  payoutInfo?: unknown
) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new SettlementError("INVALID_AMOUNT", "정산 금액이 올바르지 않아요");
  }
  if (!METHODS.has(method)) {
    throw new SettlementError("INVALID_METHOD", "지원하지 않는 정산 수단이에요");
  }
  if (amount < SETTLE_MIN) {
    throw new SettlementError(
      "MIN_AMOUNT",
      `최소 정산 금액은 ${SETTLE_MIN.toLocaleString("ko-KR")}P 예요`
    );
  }

  // R8: payoutInfo는 잘라서 저장하지 않고(잘리면 깨진 JSON), 과대하면 거부
  let payoutStr: string | null = null;
  if (payoutInfo !== undefined && payoutInfo !== null) {
    const s = JSON.stringify(payoutInfo);
    if (s.length > 1000) throw new SettlementError("INVALID_PAYOUT", "정산 정보가 너무 커요");
    payoutStr = s;
  }

  return prisma.$transaction(async (tx) => {
    const decremented = await tx.pointWallet.updateMany({
      where: { reviewerId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (decremented.count !== 1) {
      throw new SettlementError("INSUFFICIENT", "적립금이 부족해요");
    }

    const settlement = await tx.settlement.create({
      data: { reviewerId, amount, method, payoutInfo: payoutStr, status: "REQUESTED" },
    });
    // 보류 차감을 원장에도 기록(감사). idempotencyKey로 1회 보장.
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

/**
 * 관리자: 정산 승인(PAID) 또는 반려(REJECTED).
 * R3: 두 액션 모두 REQUESTED 상태에서만 허용 → 재처리·APPROVED 반려 이중환불 차단.
 */
export async function processSettlement(settlementId: string, action: "approve" | "reject") {
  return prisma.$transaction(async (tx) => {
    const s = await tx.settlement.findUnique({ where: { id: settlementId } });
    if (!s) throw new SettlementError("NOT_FOUND", "정산 요청을 찾을 수 없어요", 404);
    if (s.status !== "REQUESTED") {
      throw new SettlementError("BAD_STATE", "이미 처리된 정산이에요", 409);
    }

    if (action === "approve") {
      const updated = await tx.settlement.update({
        where: { id: s.id },
        data: { status: "PAID" },
      });
      return { settlementId: s.id, status: updated.status };
    }

    // 반려: 보류분 원복(ADJUST +) + 잔액 복원
    await tx.pointTransaction.create({
      data: {
        reviewerId: s.reviewerId,
        type: "ADJUST",
        amount: s.amount,
        settlementId: s.id,
        idempotencyKey: `settle-reject:${s.id}`,
        memo: "정산 반려 원복",
      },
    });
    await tx.pointWallet.update({
      where: { reviewerId: s.reviewerId },
      data: { balance: { increment: s.amount } },
    });
    const updated = await tx.settlement.update({
      where: { id: s.id },
      data: { status: "REJECTED" },
    });
    return { settlementId: s.id, status: updated.status };
  });
}
