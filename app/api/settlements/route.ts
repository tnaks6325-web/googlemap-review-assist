import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getReviewerId } from "@/lib/auth/session";
import { checkOrigin } from "@/lib/auth/origin";
import { requestSettlement, SettlementError } from "@/lib/domain/settlement";

export const runtime = "nodejs";

const DAY = 24 * 60 * 60 * 1000;
const DAILY_LIMIT = 3;
const METHODS = new Set(["BANK"]);

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  // R6: 정산 요청 일일 한도를 DB 기반으로(멀티 노드/재시작에 견고)
  const todays = await prisma.settlement.count({
    where: { reviewerId, createdAt: { gte: new Date(Date.now() - DAY) } },
  });
  if (todays >= DAILY_LIMIT) {
    return err("RATE_LIMITED", "오늘 정산 요청 한도를 초과했어요", 429);
  }

  const body = await req.json().catch(() => null);
  const amount = Number(body?.amount);
  const method = String(body?.method ?? "BANK");
  if (!METHODS.has(method)) return err("INVALID_METHOD", "지원하지 않는 정산 수단이에요");

  try {
    const result = await requestSettlement(reviewerId, amount, method, body?.payoutInfo);
    return ok(result);
  } catch (e) {
    if (e instanceof SettlementError) return err(e.code, e.message, e.status);
    throw e;
  }
}

export async function GET() {
  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const items = await prisma.settlement.findMany({
    where: { reviewerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, amount: true, method: true, status: true, createdAt: true },
  });
  return ok({ items });
}
