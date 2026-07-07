import { prisma } from "@/lib/db";
import { receiptDedupeHash } from "@/lib/domain/receipts";

const DAY = 24 * 60 * 60 * 1000;
const DAILY_CAP = 3;

export class DevReceiptError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export async function createDevNoReceipt(campaignId: string, reviewerId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new DevReceiptError("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없어요", 404);
  if (!campaign.active) throw new DevReceiptError("CAMPAIGN_INACTIVE", "지금은 참여할 수 없어요", 403);

  const todays = await prisma.receipt.count({
    where: {
      reviewerId,
      businessId: campaign.businessId,
      createdAt: { gte: new Date(Date.now() - DAY) },
    },
  });
  if (todays >= DAILY_CAP) {
    throw new DevReceiptError("DAILY_LIMIT", "오늘은 이 매장에서 참여 한도를 채웠어요", 429);
  }

  const devCode = `DEVNO${Date.now()}${Math.floor(Math.random() * 10000)}`;
  return prisma.receipt.create({
    data: {
      businessId: campaign.businessId,
      campaignId: campaign.id,
      reviewerId,
      code: devCode,
      source: "DEV_NO_RECEIPT",
      dedupeHash: receiptDedupeHash(campaign.businessId, devCode),
      status: "VERIFIED",
    },
  });
}
