import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

type DbClient = PrismaClient | Prisma.TransactionClient;
const REVIEWER_ASSIGNMENT_SOURCE = "CAMPAIGN_ASSIGNMENT";
const REVIEWER_HISTORY_LIMIT = 20;
const CAMPAIGN_COMPLETION_IDEMPOTENCY_PREFIX = "campaign-complete:";

export interface ReviewerHomeAccount {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface ReviewerHomeParticipationItem {
  id: string;
  businessName: string;
  campaignName: string;
  campaignSlug: string;
  status: string;
  rewardPoints: number;
  reviewNote: string | null;
  hasProofImage: boolean;
  occurredAt: string;
}

export interface ReviewerHomeDashboard {
  profile: {
    phone: string | null;
    payoutAccountRegistered: boolean;
  };
  points: {
    balance: number;
  };
  participation: {
    totalCount: number;
    reviewPendingCount: number;
    completedCount: number;
    items: ReviewerHomeParticipationItem[];
  };
}

function safeGoogleAvatarUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const isGoogleHost =
      url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com");
    return url.protocol === "https:" && isGoogleHost ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function getReviewerHomeAccount(
  reviewerId: string | null,
  db: DbClient = prisma,
): Promise<ReviewerHomeAccount | null> {
  if (!reviewerId) return null;

  const reviewer = await db.reviewer.findUnique({
    where: { id: reviewerId },
    select: {
      googleSub: true,
      name: true,
      email: true,
      avatarUrl: true,
    },
  });
  if (!reviewer?.googleSub) return null;

  return {
    name: reviewer.name,
    email: reviewer.email,
    avatarUrl: safeGoogleAvatarUrl(reviewer.avatarUrl),
  };
}

export async function getReviewerHomeDashboard(
  reviewerId: string,
  db: DbClient = prisma,
): Promise<ReviewerHomeDashboard> {
  const [reviewer, receipts, totalCount, reviewPendingCount, completedCount] = await Promise.all([
    db.reviewer.findUnique({
      where: { id: reviewerId },
      select: {
        phone: true,
        wallet: { select: { balance: true } },
        payoutAccount: { select: { id: true } },
      },
    }),
    db.receipt.findMany({
      where: {
        reviewerId,
        source: REVIEWER_ASSIGNMENT_SOURCE,
      },
      orderBy: { createdAt: "desc" },
      take: REVIEWER_HISTORY_LIMIT,
      select: {
        id: true,
        status: true,
        reviewProofSubmittedAt: true,
        reviewProofImageUrl: true,
        reviewReviewedAt: true,
        reviewReviewNote: true,
        createdAt: true,
        rewardPoints: true,
        business: { select: { name: true } },
        campaign: { select: { name: true, slug: true, rewardPoints: true } },
      },
    }),
    db.receipt.count({
      where: { reviewerId, source: REVIEWER_ASSIGNMENT_SOURCE },
    }),
    db.receipt.count({
      where: {
        reviewerId,
        source: REVIEWER_ASSIGNMENT_SOURCE,
        status: "REVIEW_SUBMITTED",
      },
    }),
    db.receipt.count({
      where: {
        reviewerId,
        source: REVIEWER_ASSIGNMENT_SOURCE,
        status: "COMPLETED",
      },
    }),
  ]);
  const paidTransactions = receipts.length
    ? await db.pointTransaction.findMany({
        where: {
          idempotencyKey: {
            in: receipts.map(
              (receipt) =>
                `${CAMPAIGN_COMPLETION_IDEMPOTENCY_PREFIX}${receipt.id}`,
            ),
          },
        },
        select: { idempotencyKey: true, amount: true },
      })
    : [];
  const paidAmountByReceiptId = new Map(
    paidTransactions.map((transaction) => [
      transaction.idempotencyKey.slice(
        CAMPAIGN_COMPLETION_IDEMPOTENCY_PREFIX.length,
      ),
      transaction.amount,
    ]),
  );

  return {
    profile: {
      phone: reviewer?.phone ?? null,
      payoutAccountRegistered: Boolean(reviewer?.payoutAccount),
    },
    points: {
      balance: reviewer?.wallet?.balance ?? 0,
    },
    participation: {
      totalCount,
      reviewPendingCount,
      completedCount,
      items: receipts.map((receipt) => ({
        id: receipt.id,
        businessName:
          ["ASSIGNED", "VERIFIED"].includes(receipt.status)
            ? "배정된 캠페인"
            : receipt.business.name,
        campaignName:
          ["ASSIGNED", "VERIFIED"].includes(receipt.status)
            ? "장소 정보 공개 전"
            : receipt.campaign.name,
        campaignSlug:
          ["ASSIGNED", "VERIFIED"].includes(receipt.status)
            ? "demo"
            : receipt.campaign.slug,
        status: receipt.status,
        rewardPoints:
          paidAmountByReceiptId.get(receipt.id) ??
          receipt.rewardPoints ??
          receipt.campaign.rewardPoints,
        reviewNote: receipt.reviewReviewNote,
        hasProofImage: Boolean(receipt.reviewProofImageUrl),
        occurredAt: (
          receipt.reviewReviewedAt ??
          receipt.reviewProofSubmittedAt ??
          receipt.createdAt
        ).toISOString(),
      })),
    },
  };
}
