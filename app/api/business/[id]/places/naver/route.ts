import { ok, err } from "@/lib/http";
import { getOwnedBusiness } from "@/lib/auth/owner-guard";
import { checkOrigin } from "@/lib/auth/origin";
import { parseNaverPlaceInput, safeJsonSnapshot } from "@/lib/domain/external-places";
import { type ExternalPlaceSnapshot } from "@/lib/domain/external-place-providers";
import { saveExternalPlace } from "@/lib/domain/external-place-save";

export const runtime = "nodejs";

function placeFromCandidate(raw: unknown, businessName: string): ExternalPlaceSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const title = String(c.title ?? "").trim().slice(0, 120);
  if (!title) return null;
  const link = String(c.link ?? "").trim();
  const parsed = link ? parseNaverPlaceInput(link) : { kind: "TEXT" as const };
  return {
    platform: "NAVER",
    externalId: parsed.externalId ?? null,
    url: parsed.url ?? (link || null),
    name: title || businessName,
    address: String(c.roadAddress ?? c.address ?? "").trim().slice(0, 240) || null,
    phone: null,
    category: String(c.category ?? "").trim().slice(0, 120) || null,
    lat: null,
    lng: null,
    rating: null,
    reviewCount: null,
    receiptReviewCount: null,
    matchConfidence: Number.isInteger(c.matchConfidence) ? (c.matchConfidence as number) : null,
    rawJson: c.rawJson ? String(c.rawJson).slice(0, 8000) : safeJsonSnapshot(c),
  };
}

function placeFromUrl(raw: string, businessName: string): ExternalPlaceSnapshot {
  const parsed = parseNaverPlaceInput(raw);
  return {
    platform: "NAVER",
    externalId: parsed.externalId ?? null,
    url: parsed.url ?? null,
    name: businessName,
    address: null,
    phone: null,
    category: null,
    lat: null,
    lng: null,
    rating: null,
    reviewCount: null,
    receiptReviewCount: null,
    matchConfidence: parsed.externalId ? 80 : 60,
    rawJson: safeJsonSnapshot({ parsed }),
  };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const { id } = await params;
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);
  if (!business) return err("FORBIDDEN", "권한이 없어요", 403);

  const body = await req.json().catch(() => null);
  const naverUrl = body?.naverUrl ? String(body.naverUrl).trim().slice(0, 500) : "";
  const place = body?.candidate
    ? placeFromCandidate(body.candidate, business.name)
    : naverUrl
      ? placeFromUrl(naverUrl, business.name)
      : null;
  if (!place) return err("INVALID_INPUT", "저장할 네이버 플레이스 정보가 올바르지 않아요");

  const saved = await saveExternalPlace(id, place);
  return ok({ place: saved });
}
