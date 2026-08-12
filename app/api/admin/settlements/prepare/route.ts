import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { createAdminSettlementForFullBalance, SettlementError } from "@/lib/domain/settlement";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  if (!(await rateLimit(`admin:settlement-prepare:${adminId}:${clientIp(req)}`, 20, HOUR_MS)).ok) {
    return err("RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  }
  const body: { reviewerIds?: unknown } | null = await req.json().catch(() => null);
  const reviewerIds = Array.isArray(body?.reviewerIds)
    ? [...new Set(body.reviewerIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))]
    : [];
  if (!reviewerIds.length) return err("INVALID_REVIEWERS", "지급 대기 등록할 리뷰어를 선택해 주세요.", 400);
  if (reviewerIds.length > 500) return err("TOO_MANY_REVIEWERS", "한 번에 최대 500명까지 등록할 수 있습니다.", 400);

  const created: Array<{ settlementId: string; reviewerId: string; amount: number }> = [];
  const skipped: Array<{ reviewerId: string; code: string }> = [];
  for (const reviewerId of reviewerIds) {
    try {
      created.push(await createAdminSettlementForFullBalance(reviewerId, `admin:${adminId}`));
    } catch (error) {
      if (error instanceof SettlementError) skipped.push({ reviewerId, code: error.code });
      else throw error;
    }
  }
  return ok({ created, skipped });
}
