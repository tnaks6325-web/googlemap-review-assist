import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getOwnerId } from "@/lib/auth/session";
import { checkOrigin } from "@/lib/auth/origin";

export const runtime = "nodejs";

const PLANS = new Set(["BASIC", "PRO"]);

// 사장님 구독 설정(결제 PG 연동은 후속 — 여기선 상태만 관리)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const ownerId = await getOwnerId();
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const { id: businessId } = await params;
  const body = await req.json().catch(() => null);
  const plan = String(body?.plan ?? "");
  if (!PLANS.has(plan)) return err("INVALID_PLAN", "플랜을 선택해 주세요");

  // 소유권 검증 (IDOR 방지)
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business || business.ownerId !== ownerId) {
    return err("FORBIDDEN", "권한이 없어요", 403);
  }

  // R4: status는 클라이언트가 설정 불가. 결제/웹훅이 관리.
  const existing = await prisma.subscription.findUnique({ where: { businessId } });
  if (existing) {
    if (existing.status === "CANCELED") {
      return err("BILLING_REQUIRED", "해지된 구독은 결제를 통해 재활성화해 주세요", 409);
    }
    const sub = await prisma.subscription.update({
      where: { businessId },
      data: { plan }, // 플랜만 변경, status 유지
    });
    return ok({ plan: sub.plan, status: sub.status });
  }

  const sub = await prisma.subscription.create({
    data: { businessId, plan, status: "ACTIVE" },
  });
  return ok({ plan: sub.plan, status: sub.status });
}
