import { err, ok } from "@/lib/http";
import { checkOrigin } from "@/lib/auth/origin";
import { getReviewerId } from "@/lib/auth/session";
import {
  getReviewerPayoutAccount,
  SettlementError,
  upsertReviewerPayoutAccount,
} from "@/lib/domain/settlement";

export const runtime = "nodejs";

export async function GET() {
  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const payoutAccount = await getReviewerPayoutAccount(reviewerId);
  return ok({ payoutAccount });
}

export async function PUT(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다", 403);
  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const body = await req.json().catch(() => null);
  try {
    const payoutAccount = await upsertReviewerPayoutAccount(reviewerId, {
      bankName: body?.bankName,
      accountNumber: body?.accountNumber,
      accountHolder: body?.accountHolder,
    });
    return ok({ payoutAccount });
  } catch (e) {
    if (e instanceof SettlementError) return err(e.code, e.message, e.status);
    throw e;
  }
}
