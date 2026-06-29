import { ok, err } from "@/lib/http";
import { getReviewerId } from "@/lib/auth/session";
import { getWalletSummary } from "@/lib/domain/points";

export const runtime = "nodejs";

export async function GET() {
  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const summary = await getWalletSummary(reviewerId);
  return ok({
    balance: summary.balance,
    items: summary.items.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      createdAt: t.createdAt,
    })),
  });
}
