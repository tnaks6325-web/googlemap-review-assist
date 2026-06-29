import { prisma } from "@/lib/db";

export interface BusinessStats {
  count: number;
  avg: number;
  dist: number[]; // [1점, 2점, 3점, 4점, 5점]
  topMenus: { name: string; count: number }[];
  recent: { id: string; rating: number; comment: string | null; createdAt: Date }[];
}

/** 매장의 비공개 피드백 통계 (사장님 대시보드용) */
export async function getBusinessStats(businessId: string): Promise<BusinessStats> {
  const menus = await prisma.menu.findMany({ where: { businessId } });
  const menuName = new Map(menus.map((m) => [m.id, m.name]));

  const feedbacks = await prisma.feedback.findMany({
    where: { receipt: { businessId } },
    orderBy: { createdAt: "desc" },
    select: { id: true, rating: true, menuIdsJson: true, comment: true, createdAt: true },
  });

  const count = feedbacks.length;
  const avg = count ? feedbacks.reduce((s, f) => s + f.rating, 0) / count : 0;
  const dist = [0, 0, 0, 0, 0];
  const menuTally = new Map<string, number>();

  for (const f of feedbacks) {
    if (f.rating >= 1 && f.rating <= 5) dist[f.rating - 1] += 1;
    let ids: string[] = [];
    try {
      ids = JSON.parse(f.menuIdsJson || "[]");
    } catch {
      ids = [];
    }
    for (const id of ids) menuTally.set(id, (menuTally.get(id) ?? 0) + 1);
  }

  const topMenus = [...menuTally.entries()]
    .map(([id, c]) => ({ name: menuName.get(id) ?? "(삭제된 메뉴)", count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const recent = feedbacks.slice(0, 8).map((f) => ({
    id: f.id,
    rating: f.rating,
    comment: f.comment,
    createdAt: f.createdAt,
  }));

  return { count, avg: Math.round(avg * 10) / 10, dist, topMenus, recent };
}
