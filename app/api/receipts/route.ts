import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getReviewerId } from "@/lib/auth/session";
import { receiptDedupeHash } from "@/lib/domain/receipts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const body = await req.json().catch(() => null);
  const campaignId = String(body?.campaignId ?? "");
  const code = String(body?.code ?? "").trim();
  if (!campaignId || !code) return err("INVALID_INPUT", "영수증 정보를 입력해 주세요");

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return err("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없어요", 404);
  if (!campaign.active) return err("CAMPAIGN_INACTIVE", "지금은 참여할 수 없어요", 403);

  const dedupeHash = receiptDedupeHash(campaign.businessId, code);
  try {
    // MVP: 코드 입력 + 캠페인 활성 → VERIFIED. (실제 매칭/OCR은 P1)
    const receipt = await prisma.receipt.create({
      data: {
        businessId: campaign.businessId,
        campaignId: campaign.id,
        reviewerId,
        code,
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
