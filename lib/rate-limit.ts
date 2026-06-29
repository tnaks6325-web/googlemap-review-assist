// 고정 윈도우 카운터 레이트리밋 (개발/단일 노드용).
// 운영(서버리스/멀티 노드)에서는 Redis 등 공유 저장소로 교체해야 한다.

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();

  // 가끔 만료 항목 정리(메모리 누수 방지)
  if (store.size > 5000) {
    for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
  }

  const e = store.get(key);
  if (!e || e.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (e.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((e.resetAt - now) / 1000) };
  }
  e.count += 1;
  return { ok: true, remaining: limit - e.count, retryAfterSec: 0 };
}

// F2: XFF는 클라이언트가 위조 가능 → 신뢰 프록시 홉 수(TRUSTED_PROXY_COUNT)만큼만 신뢰.
// 미설정(0)이면 XFF를 신뢰하지 않는다(스푸핑으로 레이트리밋 우회 차단).
export function clientIp(req: Request): string {
  const hops = Number(process.env.TRUSTED_PROXY_COUNT ?? "0");
  const xff = req.headers.get("x-forwarded-for");
  if (xff && hops > 0) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const idx = parts.length - hops - 1;
    return parts[idx >= 0 ? idx : 0] ?? "unknown";
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
