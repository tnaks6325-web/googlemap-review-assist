import { prisma } from "@/lib/db";

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
  if (wallet && wallet.balance !== ledgerBalance) {
    await prisma.pointWallet.update({
      where: { reviewerId },
      data: { balance: ledgerBalance },
    });
  }

  return { balance: ledgerBalance, items };
}

export const EARN_POINTS = Number(process.env.EARN_POINTS ?? "500");
