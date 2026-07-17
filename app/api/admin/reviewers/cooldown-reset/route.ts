import { getAdminId } from "@/lib/auth/session";
import { checkOrigin } from "@/lib/auth/origin";
import { resetReviewerCampaignCooldownByEmail } from "@/lib/domain/reviewer-cooldown-reset";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "Request origin is not allowed.", 403);

  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "Administrator login is required.", 401);

  const limit = await rateLimit(
    `admin:reviewer-cooldown-reset:${adminId}:${clientIp(req)}`,
    10,
    HOUR_MS,
  );
  if (!limit.ok) {
    return err("RATE_LIMITED", "Too many cooldown reset requests. Try again later.", 429);
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email)) {
    return err("INVALID_EMAIL", "A valid reviewer email is required.", 400);
  }

  const result = await resetReviewerCampaignCooldownByEmail(email);
  if (!result) return err("REVIEWER_NOT_FOUND", "Reviewer not found.", 404);

  return ok(result);
}
