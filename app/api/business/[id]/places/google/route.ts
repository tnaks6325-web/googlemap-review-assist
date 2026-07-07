import { ok, err } from "@/lib/http";
import { getOwnedBusiness } from "@/lib/auth/owner-guard";
import { checkOrigin } from "@/lib/auth/origin";
import { resolveGooglePlace, type ExternalPlaceSnapshot } from "@/lib/domain/external-place-providers";
import { saveExternalPlace } from "@/lib/domain/external-place-save";

export const runtime = "nodejs";

function coerceGooglePlace(raw: unknown): ExternalPlaceSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const name = String(p.name ?? p.displayName ?? "").trim().slice(0, 120);
  if (!name) return null;
  return {
    platform: "GOOGLE",
    externalId: p.externalId ? String(p.externalId).trim().slice(0, 256) : null,
    url: p.url ? String(p.url).trim().slice(0, 500) : null,
    name,
    address: p.address ? String(p.address).trim().slice(0, 240) : null,
    phone: p.phone ? String(p.phone).trim().slice(0, 80) : null,
    category: p.category ? String(p.category).trim().slice(0, 120) : null,
    lat: typeof p.lat === "number" ? p.lat : null,
    lng: typeof p.lng === "number" ? p.lng : null,
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewCount: Number.isInteger(p.reviewCount) ? (p.reviewCount as number) : null,
    receiptReviewCount: null,
    matchConfidence: Number.isInteger(p.matchConfidence) ? (p.matchConfidence as number) : 100,
    rawJson: p.rawJson ? String(p.rawJson).slice(0, 8000) : null,
  };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const { id } = await params;
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);
  if (!business) return err("FORBIDDEN", "권한이 없어요", 403);

  const body = await req.json().catch(() => null);
  const urlOrPlaceId = body?.urlOrPlaceId ? String(body.urlOrPlaceId).trim() : "";
  const place = urlOrPlaceId ? (await resolveGooglePlace(urlOrPlaceId)).place : coerceGooglePlace(body?.place);
  if (!place) return err("INVALID_INPUT", "저장할 구글 플레이스 정보가 올바르지 않아요");

  const saved = await saveExternalPlace(id, place);
  return ok({ place: saved });
}
