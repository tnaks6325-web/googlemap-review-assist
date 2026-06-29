import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getReviewerId } from "@/lib/auth/session";
import { EARN_POINTS } from "@/lib/domain/points";
import { checkOrigin } from "@/lib/auth/origin";

export const runtime = "nodejs";

// 설문 제출 = 적립(EARN) 트리거. 컴플라이언스 C1: 공개 게시와 무관.
export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const body = await req.json().catch(() => null);
  const receiptId = String(body?.receiptId ?? "");
  const rating = Number(body?.rating);
  let comment = typeof body?.comment === "string" ? body.comment : undefined;
  if (!receiptId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return err("INVALID_INPUT", "별점과 영수증 정보를 확인해 주세요");
  }
  if (comment && comment.length > 500) comment = comment.slice(0, 500); // R9: 길이 제한

  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: { feedback: true, business: { include: { menus: true } } },
  });
  if (!receipt || receipt.reviewerId !== reviewerId) {
    return err("RECEIPT_NOT_FOUND", "영수증을 찾을 수 없어요", 404);
  }
  if (receipt.status !== "VERIFIED") {
    return err("RECEIPT_NOT_VERIFIED", "인증되지 않은 영수증이에요", 403);
  }

  // R9: menuIds는 해당 매장 메뉴로만 한정 + 개수 제한
  const validIds = new Set(receipt.business.menus.map((m) => m.id));
  const menuIds = (Array.isArray(body?.menuIds) ? body.menuIds.map(String) : [])
    .filter((id: string) => validIds.has(id))
    .slice(0, validIds.size);

  // 멱등: 이미 제출된 영수증 → 기존 결과 반환 (적립 1회 보장)
  if (receipt.feedback) {
    const wallet = await prisma.pointWallet.findUnique({ where: { reviewerId } });
    return ok({
      feedbackId: receipt.feedback.id,
      earned: 0,
      balance: wallet?.balance ?? 0,
      alreadySubmitted: true,
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const feedback = await tx.feedback.create({
        data: {
          receiptId,
          rating,
          menuIdsJson: JSON.stringify(menuIds),
          comment,
          status: "SUBMITTED",
        },
      });
      // EARN: feedbackId 필수, idempotencyKey=receiptId (영수증당 1회)
      await tx.pointTransaction.create({
        data: {
          reviewerId,
          type: "EARN",
          amount: EARN_POINTS,
          feedbackId: feedback.id,
          idempotencyKey: receiptId,
        },
      });
      const wallet = await tx.pointWallet.update({
        where: { reviewerId },
        data: { balance: { increment: EARN_POINTS } },
      });
      return { feedbackId: feedback.id, earned: EARN_POINTS, balance: wallet.balance };
    });
    return ok(result);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // 동시 중복 제출 — 기존 결과 반환
      const fb = await prisma.feedback.findUnique({ where: { receiptId } });
      const wallet = await prisma.pointWallet.findUnique({ where: { reviewerId } });
      return ok({
        feedbackId: fb?.id,
        earned: 0,
        balance: wallet?.balance ?? 0,
        alreadySubmitted: true,
      });
    }
    throw e;
  }
}
