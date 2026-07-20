import { ok, err } from "@/lib/http";
import { checkOrigin } from "@/lib/auth/origin";
import {
  getReviewerId,
  REVIEWER_COOKIE,
  sessionCookieOptions,
  signReviewerSession,
} from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  authenticateGoogleReviewer,
  GoogleAuthError,
  verifyGoogleAccessToken,
  verifyGoogleIdToken,
} from "@/lib/domain/google-auth";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

export async function GET() {
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID?.trim() ?? "";
  return ok({ configured: Boolean(clientId), clientId: clientId || null });
}

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다", 403);

  const ip = clientIp(req);
  if (!(await rateLimit(`google-auth:ip:${ip}`, 30, HOUR)).ok) {
    return err("RATE_LIMITED", "요청이 많아요. 잠시 후 다시 시도해 주세요", 429);
  }

  const body = await req.json().catch(() => null);
  const credential = typeof body?.credential === "string" ? body.credential : "";
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
  const mode = body?.mode === "switch" ? "switch" : "login";
  if ((!credential && !accessToken) || (credential && accessToken)) {
    return err("GOOGLE_TOKEN_REQUIRED", "Google 로그인 토큰이 필요합니다", 400);
  }

  try {
    const currentReviewerId = await getReviewerId();
    const profile = accessToken
      ? await verifyGoogleAccessToken(accessToken)
      : await verifyGoogleIdToken(credential);
    const result = await authenticateGoogleReviewer(profile, currentReviewerId, { mode });
    const res = ok({
      reviewerId: result.reviewer.id,
      email: result.reviewer.email,
      name: result.reviewer.name,
      created: result.created,
      linked: result.linked,
      switched: result.switched,
    });
    res.cookies.set(REVIEWER_COOKIE, signReviewerSession(result.reviewer.id), sessionCookieOptions);
    return res;
  } catch (e) {
    if (e instanceof GoogleAuthError) return err(e.code, e.message, e.status);
    throw e;
  }
}
