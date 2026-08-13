import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import {
  deleteReviewDraftPersona,
  ReviewDraftPersonaError,
  updateReviewDraftPersona,
} from "@/lib/domain/review-draft-personas";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;
type RouteContext = { params: Promise<{ personaId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ReviewDraftPersonaError) return err(error.code, error.message, error.status);
  return err("REVIEW_DRAFT_PERSONA_OPERATION_FAILED", "가상 리뷰어를 처리하지 못했습니다.", 500);
}

async function authorize(req: Request, action: string) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  if (!(await rateLimit(`admin:review-draft-persona:${action}:${adminId}:${clientIp(req)}`, 60, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요.", 429);
  }
  return adminId;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const authorization = await authorize(req, "update");
  if (typeof authorization !== "string") return authorization;
  const body = await req.json().catch(() => null);
  const { personaId } = await params;
  try {
    return ok({ persona: await updateReviewDraftPersona(personaId, body) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const authorization = await authorize(req, "delete");
  if (typeof authorization !== "string") return authorization;
  const { personaId } = await params;
  try {
    await deleteReviewDraftPersona(personaId);
    return ok({ deletedId: personaId });
  } catch (error) {
    return errorResponse(error);
  }
}
