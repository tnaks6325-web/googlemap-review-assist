import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const key = `test:rate-limit:${Date.now()}`;

afterEach(async () => {
  await prisma.rateLimitBucket.deleteMany({ where: { key } });
});

describe("shared rate limiting", () => {
  it("uses one persisted quota across calls", async () => {
    const first = await rateLimit(key, 2, 60_000);
    const second = await rateLimit(key, 2, 60_000);
    const third = await rateLimit(key, 2, 60_000);

    expect(first).toMatchObject({ ok: true, remaining: 1 });
    expect(second).toMatchObject({ ok: true, remaining: 0 });
    expect(third.ok).toBe(false);
    expect(third.retryAfterSec).toBeGreaterThan(0);
  });
});
