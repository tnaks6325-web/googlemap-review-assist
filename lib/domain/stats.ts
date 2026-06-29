import { prisma } from "@/lib/db";

const DAY = 24 * 60 * 60 * 1000;

// 불만 키워드 추출용 한국어 불용어(간이)
const STOP = new Set([
  "그리고", "근데", "너무", "조금", "정말", "진짜", "에서", "합니다", "했어요",
  "같아요", "있어요", "해서", "해요", "그냥", "약간", "했는데", "처럼", "보다",
  "그런데", "하지만", "여기", "거기", "이거", "저거", "그거",
]);

export interface BusinessStats {
  count: number;
  avg: number;
  dist: number[]; // [1점..5점]
  topMenus: { name: string; count: number }[];
  recent: { id: string; rating: number; comment: string | null; createdAt: Date }[];
  // 고도화
  trend: { weeksAgo: number; count: number; avg: number }[]; // 최근 8주(오래된→최신)
  comparison: { thisCount: number; prevCount: number; thisAvg: number; prevAvg: number };
  draftRate: number; // 초안 생성률(%) — 게시 의향 추정 proxy
  complaintKeywords: { word: string; count: number }[];
}

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

  const now = Date.now();
  const WEEKS = 8;
  const trendBuckets = Array.from({ length: WEEKS }, () => ({ count: 0, sum: 0 }));
  const freq = new Map<string, number>();
  let this30 = 0,
    this30Sum = 0,
    prev30 = 0,
    prev30Sum = 0;

  for (const f of feedbacks) {
    if (f.rating >= 1 && f.rating <= 5) dist[f.rating - 1] += 1;

    let ids: string[] = [];
    try {
      ids = JSON.parse(f.menuIdsJson || "[]");
    } catch {
      ids = [];
    }
    for (const id of ids) menuTally.set(id, (menuTally.get(id) ?? 0) + 1);

    const age = now - f.createdAt.getTime();
    const wk = Math.floor(age / (7 * DAY));
    if (wk >= 0 && wk < WEEKS) {
      trendBuckets[wk].count += 1;
      trendBuckets[wk].sum += f.rating;
    }
    if (age < 30 * DAY) {
      this30 += 1;
      this30Sum += f.rating;
    } else if (age < 60 * DAY) {
      prev30 += 1;
      prev30Sum += f.rating;
    }

    // 불만 키워드: 낮은 별점(≤3) 소감에서
    if (f.rating <= 3 && f.comment) {
      for (const tok of f.comment.split(/[^가-힣A-Za-z0-9]+/)) {
        if (tok.length >= 2 && !STOP.has(tok)) freq.set(tok, (freq.get(tok) ?? 0) + 1);
      }
    }
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

  const trend = trendBuckets
    .map((t, i) => ({ weeksAgo: i, count: t.count, avg: t.count ? Math.round((t.sum / t.count) * 10) / 10 : 0 }))
    .reverse();

  // 초안 생성률 = 초안이 1개 이상 생성된 피드백 비율(게시 의향 추정)
  let draftRate = 0;
  if (count) {
    const drafted = await prisma.aiDraft.findMany({
      where: { feedbackId: { in: feedbacks.map((f) => f.id) } },
      distinct: ["feedbackId"],
      select: { feedbackId: true },
    });
    draftRate = Math.round((drafted.length / count) * 100);
  }

  const complaintKeywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, c]) => ({ word, count: c }));

  return {
    count,
    avg: Math.round(avg * 10) / 10,
    dist,
    topMenus,
    recent,
    trend,
    comparison: {
      thisCount: this30,
      prevCount: prev30,
      thisAvg: this30 ? Math.round((this30Sum / this30) * 10) / 10 : 0,
      prevAvg: prev30 ? Math.round((prev30Sum / prev30) * 10) / 10 : 0,
    },
    draftRate,
    complaintKeywords,
  };
}
