import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import {
  createReviewDraftPersona,
  listReviewDraftPersonas,
  ReviewDraftPersonaError,
} from "@/lib/domain/review-draft-personas";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

function errorResponse(error: unknown) {
  if (error instanceof ReviewDraftPersonaError) return err(error.code, error.message, error.status);
  return err("REVIEW_DRAFT_PERSONA_OPERATION_FAILED", "가상 리뷰어를 처리하지 못했습니다.", 500);
}

export async function GET() {
  if (!(await getAdminId())) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  try {
    return ok({ personas: await listReviewDraftPersonas() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  if (!(await rateLimit(`admin:review-draft-persona:create:${adminId}:${clientIp(req)}`, 30, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요.", 429);
  }
  const body = await req.json().catch(() => null);
  try {
    return ok({ persona: await createReviewDraftPersona(body) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
