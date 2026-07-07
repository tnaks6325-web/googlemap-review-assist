import { ok, err } from "@/lib/http";
import { getOwnedBusiness } from "@/lib/auth/owner-guard";
import { checkOrigin } from "@/lib/auth/origin";
import { rateLimit } from "@/lib/rate-limit";
import { resolveGooglePlace } from "@/lib/domain/external-place-providers";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const { id } = await params;
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);
  if (!business) return err("FORBIDDEN", "권한이 없어요", 403);
  if (!rateLimit(`owner:google-resolve:${ownerId}`, 40, HOUR).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const body = await req.json().catch(() => null);
  const urlOrPlaceId = String(body?.urlOrPlaceId ?? "").trim();
  if (urlOrPlaceId.length < 2 || urlOrPlaceId.length > 500) {
    return err("INVALID_INPUT", "구글플레이스 URL 또는 Place ID를 입력해 주세요");
  }

  try {
    const result = await resolveGooglePlace(urlOrPlaceId);
    return ok(result);
  } catch {
    return err("GOOGLE_PLACE_LOOKUP_FAILED", "구글 플레이스 정보를 확인하지 못했어요", 502);
  }
}
