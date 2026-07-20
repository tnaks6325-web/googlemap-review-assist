import { checkOrigin } from "@/lib/auth/origin";
import { getReviewerId } from "@/lib/auth/session";
import {
  SettlementError,
  updateReviewerSettlementProfile,
} from "@/lib/domain/settlement";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);

  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요합니다.", 401);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return err("INVALID_BODY", "입력 정보를 확인해 주세요.", 400);
  }

  try {
    const profile = await updateReviewerSettlementProfile(reviewerId, {
      name: body.name,
      phone: body.phone,
    });
    return ok({ profile });
  } catch (error) {
    if (error instanceof SettlementError) return err(error.code, error.message, error.status);
    return err("PROFILE_UPDATE_FAILED", "기본 정보를 저장하지 못했어요.", 500);
  }
}
