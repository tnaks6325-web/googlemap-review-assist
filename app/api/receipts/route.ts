import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getReviewerId } from "@/lib/auth/session";
import { receiptDedupeHash, canonicalizeCode } from "@/lib/domain/receipts";
import { checkOrigin } from "@/lib/auth/origin";

export const runtime = "nodejs";

const DAY = 24 * 60 * 60 * 1000;
const DAILY_CAP = 3;

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const body = await req.json().catch(() => null);
  const campaignId = String(body?.campaignId ?? "");
  const canonical = canonicalizeCode(String(body?.code ?? ""));
  if (!campaignId || canonical.length < 4 || canonical.length > 40) {
    return err("INVALID_INPUT", "영수증 정보를 확인해 주세요");
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return err("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없어요", 404);
  if (!campaign.active) return err("CAMPAIGN_INACTIVE", "지금은 참여할 수 없어요", 403);

  // R5: DB 기반 일일 한도(멀티 노드/재시작에도 견고)
  const todays = await prisma.receipt.count({
    where: {
      reviewerId,
      businessId: campaign.businessId,
      createdAt: { gte: new Date(Date.now() - DAY) },
    },
  });
  if (todays >= DAILY_CAP) {
    return err("DAILY_LIMIT", "오늘은 이 매장에서 참여 한도를 채웠어요", 429);
  }

  // R1: 자가신고 임의 코드가 아니라, 업체가 발급한 미사용 코드와 일치할 때만 VERIFIED.
  const issued = await prisma.campaignCode.findUnique({
    where: { campaignId_code: { campaignId: campaign.id, code: canonical } },
  });
  if (!issued) {
    return err("INVALID_CODE", "유효하지 않은 코드예요. 영수증의 코드를 확인해 주세요", 422);
  }

  const dedupeHash = receiptDedupeHash(campaign.businessId, canonical);
  try {
    const receipt = await prisma.$transaction(async (tx) => {
      // 1회용 코드 원자적 소진
      const claim = await tx.campaignCode.updateMany({
        where: { id: issued.id, used: false },
        data: { used: true, usedAt: new Date() },
      });
      if (claim.count !== 1) throw new Error("CODE_USED");
      return tx.receipt.create({
        data: {
          businessId: campaign.businessId,
          campaignId: campaign.id,
          reviewerId,
          code: canonical, // R6: 정규화 형태로 저장
          source: "CODE",
          dedupeHash,
          status: "VERIFIED",
        },
      });
    });
    return ok({ receiptId: receipt.id, status: receipt.status });
  } catch (e) {
    if (e instanceof Error && e.message === "CODE_USED") {
      return err("RECEIPT_ALREADY_USED", "이미 사용된 코드예요", 409);
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return err("RECEIPT_ALREADY_USED", "이미 참여한 영수증이에요", 409);
    }
    throw e;
  }
}
