import { prisma } from "@/lib/db";

/** 적립금 잔액 + 최근 내역 */
export async function getWalletSummary(reviewerId: string) {
  const wallet = await prisma.pointWallet.findUnique({ where: { reviewerId } });
  const items = await prisma.pointTransaction.findMany({
    where: { reviewerId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return { balance: wallet?.balance ?? 0, items };
}

export const EARN_POINTS = Number(process.env.EARN_POINTS ?? "500");
