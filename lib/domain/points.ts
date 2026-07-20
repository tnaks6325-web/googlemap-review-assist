import { prisma } from "@/lib/db";
import { recordOperationalError } from "@/lib/error-logging";

/**
 * 적립금 잔액 + 최근 내역.
 * R2a: 잔액은 append-only 원장 합계를 권위값으로 사용한다.
 * 캐시(PointWallet.balance)와 드리프트가 있으면 원장 기준으로 자가 보정.
 */
export async function getWalletSummary(reviewerId: string) {
  const [items, agg, wallet] = await Promise.all([
    prisma.pointTransaction.findMany({
      where: { reviewerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.pointTransaction.aggregate({
      where: { reviewerId },
      _sum: { amount: true },
    }),
    prisma.pointWallet.findUnique({ where: { reviewerId } }),
  ]);

  const ledgerBalance = agg._sum.amount ?? 0;
  // R5: 드리프트/음수 원장은 자가보정만 하지 말고 경고로 가시화(모니터링 훅)
  if (ledgerBalance < 0) {
    console.error(`[points] 원장 잔액 음수 감지 reviewer=${reviewerId} balance=${ledgerBalance}`);
    await recordOperationalError({
      severity: "CRITICAL",
      source: "SERVER",
      workflow: "포인트 잔액 확인",
      stage: "포인트 원장 합계 계산",
      code: "NEGATIVE_POINT_LEDGER",
      title: "리뷰어 포인트 원장 잔액이 음수입니다.",
      situation: "리뷰어의 사용 가능한 포인트를 계산하던 중이었습니다.",
      cause: "지급된 포인트보다 차감된 포인트가 더 많아 원장 합계가 음수가 되었습니다.",
      impact: "해당 리뷰어의 포인트와 정산 금액이 올바르지 않을 수 있습니다.",
      action: "해당 리뷰어의 포인트 거래 원장을 확인하고 중복 차감이나 누락된 적립을 점검해 주세요.",
      entityType: "reviewer",
      entityId: reviewerId,
      metadata: { ledgerBalance },
    });
  }
  if (wallet && wallet.balance !== ledgerBalance) {
    console.warn(
      `[points] 잔액 드리프트 reviewer=${reviewerId} cache=${wallet.balance} ledger=${ledgerBalance}`
    );
    await recordOperationalError({
      severity: "WARNING",
      source: "SERVER",
      workflow: "포인트 잔액 확인",
      stage: "지갑 잔액과 원장 비교",
      code: "POINT_BALANCE_DRIFT",
      title: "표시용 포인트 잔액과 거래 원장이 일치하지 않았습니다.",
      situation: "리뷰어의 포인트 잔액을 불러오던 중 자동 정합성 검사를 수행했습니다.",
      cause: "저장된 지갑 잔액이 포인트 거래 원장의 합계와 달랐습니다.",
      impact: "시스템이 원장 기준으로 잔액을 자동 보정했으며 잠시 잘못된 잔액이 표시되었을 수 있습니다.",
      action: "같은 리뷰어에게 반복되는지 확인하고 포인트 지급·차감 트랜잭션을 점검해 주세요.",
      entityType: "reviewer",
      entityId: reviewerId,
      metadata: { cachedBalance: wallet.balance, ledgerBalance },
    });
    await prisma.pointWallet.update({
      where: { reviewerId },
      data: { balance: ledgerBalance },
    });
  }

  return { balance: ledgerBalance, items };
}

export const EARN_POINTS = Number(process.env.EARN_POINTS ?? "500");
