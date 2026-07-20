import { err, ok } from "@/lib/http";
import { getReviewerId } from "@/lib/auth/session";
import { getReviewerSettlementSummary } from "@/lib/domain/settlement";

export const runtime = "nodejs";

export async function GET() {
  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const summary = await getReviewerSettlementSummary(reviewerId);
  const response = ok(summary);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
