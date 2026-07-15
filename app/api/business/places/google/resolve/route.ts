import { ok, err } from "@/lib/http";
import { checkOrigin } from "@/lib/auth/origin";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { resolveGooglePlace } from "@/lib/domain/external-place-providers";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  // Capture configuration before the database-backed limiter initializes framework env state.
  const googlePlacesApiKey = process.env.GOOGLE_PLACES_API_KEY || null;
  const ip = clientIp(req);
  if (!(await rateLimit(`public:google-preview:${ip}`, 80, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const body = await req.json().catch(() => null);
  const urlOrPlaceId = String(body?.urlOrPlaceId ?? "").trim();
  if (urlOrPlaceId.length < 2 || urlOrPlaceId.length > 500) {
    return err("INVALID_INPUT", "구글플레이스 URL 또는 Place ID를 입력해 주세요");
  }

  try {
    return ok(await resolveGooglePlace(urlOrPlaceId, googlePlacesApiKey));
  } catch {
    return err("GOOGLE_PLACE_LOOKUP_FAILED", "구글 플레이스 정보를 확인하지 못했어요", 502);
  }
}
