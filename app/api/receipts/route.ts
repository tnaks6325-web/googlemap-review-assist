import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getReviewerId } from "@/lib/auth/session";
import { receiptDedupeHash, canonicalizeCode } from "@/lib/domain/receipts";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/auth/origin";

export const runtime = "nodejs";

const DAY = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const body = await req.json().catch(() => null);
  const campaignId = String(body?.campaignId ?? "");
  const rawCode = String(body?.code ?? "");
  const canonical = canonicalizeCode(rawCode);
  if (!campaignId || canonical.length < 4 || canonical.length > 40) {
    return err("INVALID_INPUT", "영수증 정보를 확인해 주세요");
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return err("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없어요", 404);
  if (!campaign.active) return err("CAMPAIGN_INACTIVE", "지금은 참여할 수 없어요", 403);

  // R4(임시 방어): 실 영수증 검증(OCR/발급코드 매칭) 도입 전까지,
  // 리뷰어·매장당 하루 적립 횟수를 제한해 자가신고 코드로 인한 무제한 적립을 차단.
  if (!rateLimit(`receipt:${reviewerId}:${campaign.businessId}`, 3, DAY).ok) {
    return err("DAILY_LIMIT", "오늘은 이 매장에서 참여 한도를 채웠어요", 429);
  }

  const dedupeHash = receiptDedupeHash(campaign.businessId, rawCode);
  try {
    const receipt = await prisma.receipt.create({
      data: {
        businessId: campaign.businessId,
        campaignId: campaign.id,
        reviewerId,
        code: rawCode.trim().slice(0, 64),
        dedupeHash,
        status: "VERIFIED",
      },
    });
    return ok({ receiptId: receipt.id, status: receipt.status });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return err("RECEIPT_ALREADY_USED", "이미 참여한 영수증이에요", 409);
    }
    throw e;
  }
}
