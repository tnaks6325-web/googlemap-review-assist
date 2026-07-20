import { Prisma, type PrismaClient } from "@prisma/client";
import {
  CAMPAIGN_ASSIGNMENT_TTL_MS,
  kstDayWindow,
} from "@/lib/domain/campaign-availability-policy";

export const CAMPAIGN_ASSIGNMENT_SOURCE = "CAMPAIGN_ASSIGNMENT";
export const CAMPAIGN_ASSIGNMENT_STATUS_EXPIRED = "EXPIRED";

export type CampaignStatsDb = PrismaClient | Prisma.TransactionClient;

export interface CampaignParticipationStats {
  assignedCount: number;
  completedCount: number;
  assignedTodayCount: number;
  completedTodayCount: number;
  paidPointAmount: number;
}

export function emptyCampaignParticipationStats(): CampaignParticipationStats {
  return {
    assignedCount: 0,
    completedCount: 0,
    assignedTodayCount: 0,
    completedTodayCount: 0,
    paidPointAmount: 0,
  };
}

export function effectiveCampaignAssignmentWhere(
  now = new Date(),
): Prisma.ReceiptWhereInput {
  const legacyExpiryCutoff = new Date(now.getTime() - CAMPAIGN_ASSIGNMENT_TTL_MS);
  return {
    source: CAMPAIGN_ASSIGNMENT_SOURCE,
    OR: [
      { status: { in: ["VERIFIED", "REVIEW_SUBMITTED", "COMPLETED"] } },
      { status: "REJECTED", reviewProofSubmittedAt: { not: null } },
      {
        status: "ASSIGNED",
        reviewProofSubmittedAt: null,
        OR: [
          { assignmentExpiresAt: { gt: now } },
          { assignmentExpiresAt: null, createdAt: { gt: legacyExpiryCutoff } },
        ],
      },
    ],
  };
}

export async function expireStaleCampaignAssignments(
  db: CampaignStatsDb,
  now = new Date(),
) {
  const legacyExpiryCutoff = new Date(now.getTime() - CAMPAIGN_ASSIGNMENT_TTL_MS);
  return db.receipt.updateMany({
    where: {
      source: CAMPAIGN_ASSIGNMENT_SOURCE,
      status: "ASSIGNED",
      reviewProofSubmittedAt: null,
      OR: [
        { assignmentExpiresAt: { lte: now } },
        { assignmentExpiresAt: null, createdAt: { lte: legacyExpiryCutoff } },
      ],
    },
    data: { status: CAMPAIGN_ASSIGNMENT_STATUS_EXPIRED },
  });
}

export async function fetchCampaignParticipationStats(
  db: CampaignStatsDb,
  campaignIds: string[],
  now = new Date(),
) {
  const statsByCampaignId = new Map<string, CampaignParticipationStats>(
    campaignIds.map((campaignId) => [campaignId, emptyCampaignParticipationStats()]),
  );
  if (campaignIds.length === 0) return statsByCampaignId;

  const { start, end } = kstDayWindow(now);
  const rows = await db.receipt.findMany({
    where: {
      campaignId: { in: campaignIds },
      ...effectiveCampaignAssignmentWhere(now),
    },
    select: {
      campaignId: true,
      status: true,
      createdAt: true,
      reviewReviewedAt: true,
    },
  });

  for (const row of rows) {
    const stats = statsByCampaignId.get(row.campaignId) ?? emptyCampaignParticipationStats();
    stats.assignedCount += 1;
    if (row.createdAt >= start && row.createdAt < end) stats.assignedTodayCount += 1;
    if (row.status === "COMPLETED") {
      stats.completedCount += 1;
      if (row.reviewReviewedAt && row.reviewReviewedAt >= start && row.reviewReviewedAt < end) {
        stats.completedTodayCount += 1;
      }
    }
    statsByCampaignId.set(row.campaignId, stats);
  }
  return statsByCampaignId;
}
