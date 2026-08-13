import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import {
  appendReviewDraftPersonaExample,
  ReviewDraftPersonaError,
} from "@/lib/domain/review-draft-personas";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

export async function POST(req: Request, { params }: { params: Promise<{ personaId: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  if (!(await rateLimit(`admin:review-draft-persona:example:${adminId}:${clientIp(req)}`, 120, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요.", 429);
  }
  const body = await req.json().catch(() => null) as { text?: unknown } | null;
  const { personaId } = await params;
  try {
    return ok({ persona: await appendReviewDraftPersonaExample(personaId, body?.text) });
  } catch (error) {
    if (error instanceof ReviewDraftPersonaError) return err(error.code, error.message, error.status);
    return err("REVIEW_DRAFT_PERSONA_OPERATION_FAILED", "학습용 원고를 저장하지 못했습니다.", 500);
  }
}
