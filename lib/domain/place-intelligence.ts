import { prisma } from "@/lib/db";
import { getBusinessStats } from "@/lib/domain/stats";

const STOP = new Set([
  "그리고",
  "근데",
  "너무",
  "정말",
  "진짜",
  "있어요",
  "했어요",
  "같아요",
  "여기",
  "방문",
  "리뷰",
]);

function keywordSummary(contents: (string | null)[]) {
  const freq = new Map<string, number>();
  for (const content of contents) {
    if (!content) continue;
    for (const token of content.split(/[^가-힣A-Za-z0-9]+/)) {
      if (token.length >= 2 && !STOP.has(token)) freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, count]) => ({ word, count }));
}

export async function getPlaceIntelligence(businessId: string) {
  const [internal, places, reviews] = await Promise.all([
    getBusinessStats(businessId),
    prisma.externalPlace.findMany({ where: { businessId }, orderBy: { platform: "asc" } }),
    prisma.externalReview.findMany({
      where: { businessId },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 1000,
      select: {
        id: true,
        platform: true,
        reviewType: true,
        rating: true,
        content: true,
        authorMasked: true,
        publishedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const byPlatform = { GOOGLE: 0, NAVER: 0 };
  const byType = { GENERAL: 0, RECEIPT: 0, BOOKING: 0, ORDER: 0, UNKNOWN: 0 };
  for (const r of reviews) {
    if (r.platform === "GOOGLE" || r.platform === "NAVER") byPlatform[r.platform] += 1;
    if (r.reviewType in byType) byType[r.reviewType as keyof typeof byType] += 1;
    else byType.UNKNOWN += 1;
  }

  return {
    internal,
    places: {
      google: places.find((p) => p.platform === "GOOGLE") ?? null,
      naver: places.find((p) => p.platform === "NAVER") ?? null,
    },
    external: {
      totalReviews: reviews.length,
      byPlatform,
      byType,
      keywords: keywordSummary(reviews.map((r) => r.content)),
      recent: reviews.slice(0, 10),
    },
  };
}
