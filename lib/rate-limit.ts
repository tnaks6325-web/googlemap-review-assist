type Entry = { count: number; resetAt: number };
const developmentStore = new Map<string, Entry>();

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export class RateLimitStorageError extends Error {
  constructor() {
    super("Rate limit storage is unavailable.");
    this.name = "RateLimitStorageError";
  }
}

function consumeDevelopmentRateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  if (developmentStore.size > 5000) {
    for (const [storedKey, entry] of developmentStore) {
      if (entry.resetAt <= now) developmentStore.delete(storedKey);
    }
  }

  const entry = developmentStore.get(key);
  if (!entry || entry.resetAt <= now) {
    developmentStore.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: Math.max(0, limit - 1), retryAfterSec: 0 };
  }
  if (entry.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true, remaining: Math.max(0, limit - entry.count), retryAfterSec: 0 };
}

async function consumeDatabaseRateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  const { prisma } = await import("@/lib/db");
  const now = new Date();
  const nextResetAt = new Date(now.getTime() + windowMs);

  await prisma.rateLimitBucket.upsert({
    where: { key },
    create: { key, count: 0, resetAt: now },
    update: {},
  });
  await prisma.rateLimitBucket.updateMany({
    where: { key, resetAt: { lte: now } },
    data: { count: 0, resetAt: nextResetAt },
  });
  const claimed = await prisma.rateLimitBucket.updateMany({
    where: { key, resetAt: { gt: now }, count: { lt: limit } },
    data: { count: { increment: 1 } },
  });
  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });
  if (!bucket) throw new RateLimitStorageError();

  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000));
  if (claimed.count === 0) return { ok: false, remaining: 0, retryAfterSec };
  return { ok: true, remaining: Math.max(0, limit - bucket.count), retryAfterSec: 0 };
}

/**
 * Uses the database in every deployed environment so separate serverless instances
 * share one quota. Development falls back to memory when the local schema has not
 * yet been pushed.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  try {
    return await consumeDatabaseRateLimit(key, limit, windowMs);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      return consumeDevelopmentRateLimit(key, limit, windowMs);
    }
    throw new RateLimitStorageError();
  }
}

export function clientIp(req: Request): string {
  const hops = Number(process.env.TRUSTED_PROXY_COUNT ?? "0");
  const xff = req.headers.get("x-forwarded-for");
  if (xff && hops > 0) {
    const parts = xff.split(",").map((value) => value.trim()).filter(Boolean);
    const index = parts.length - hops - 1;
    return parts[index >= 0 ? index : 0] ?? "unknown";
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
