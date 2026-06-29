import { prisma } from "@/lib/db";

const maskPhone = (p?: string) => (p && p.length >= 5 ? `${p.slice(0, 3)}****${p.slice(-2)}` : "?");

/** 승인 대기 정산 큐 */
export async function getPendingSettlements() {
  const items = await prisma.settlement.findMany({
    where: { status: "REQUESTED" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { reviewer: { select: { phone: true } } },
  });
  return items.map((s) => ({
    id: s.id,
    amount: s.amount,
    method: s.method,
    phone: maskPhone(s.reviewer.phone),
    createdAt: s.createdAt,
  }));
}

/** 어뷰징 신호 — 매장 집중 리뷰어 / 고액 적립자 */
export async function getAbuseSignals() {
  // 1) (리뷰어, 매장)별 영수증 수 상위 — self-dealing 집중 탐지
  const grouped = await prisma.receipt.groupBy({
    by: ["reviewerId", "businessId"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });
  const rIds = [...new Set(grouped.map((g) => g.reviewerId))];
  const bIds = [...new Set(grouped.map((g) => g.businessId))];
  const [reviewers, businesses] = await Promise.all([
    prisma.reviewer.findMany({ where: { id: { in: rIds } }, select: { id: true, phone: true } }),
    prisma.business.findMany({ where: { id: { in: bIds } }, select: { id: true, name: true } }),
  ]);
  const rMap = new Map(reviewers.map((r) => [r.id, r.phone]));
  const bMap = new Map(businesses.map((b) => [b.id, b.name]));
  const concentration = grouped.map((g) => ({
    phone: maskPhone(rMap.get(g.reviewerId)),
    business: bMap.get(g.businessId) ?? "?",
    count: g._count.id,
  }));

  // 2) EARN 합계 상위 적립자
  const earners = await prisma.pointTransaction.groupBy({
    by: ["reviewerId"],
    where: { type: "EARN" },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 10,
  });
  const eMap = new Map(
    (
      await prisma.reviewer.findMany({
        where: { id: { in: earners.map((e) => e.reviewerId) } },
        select: { id: true, phone: true },
      })
    ).map((r) => [r.id, r.phone])
  );
  const topEarners = earners.map((e) => ({
    phone: maskPhone(eMap.get(e.reviewerId)),
    total: e._sum.amount ?? 0,
  }));

  return { concentration, topEarners };
}
