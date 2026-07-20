import { prisma } from "@/lib/db";

export const REVIEWER_PLACE_COOLDOWN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewerCooldownResetResult {
  reviewerId: string;
  resetCount: number;
  cooldownDays: number;
}

async function resetReviewerCampaignCooldown(
  reviewerId: string,
  now: Date,
): Promise<ReviewerCooldownResetResult> {
  const cooldownStartedAt = new Date(now.getTime() - REVIEWER_PLACE_COOLDOWN_DAYS * DAY_MS);
  const resetCreatedAt = new Date(now.getTime() - (REVIEWER_PLACE_COOLDOWN_DAYS + 1) * DAY_MS);
  const update = await prisma.receipt.updateMany({
    where: {
      reviewerId,
      createdAt: { gte: cooldownStartedAt },
    },
    data: { createdAt: resetCreatedAt },
  });

  return {
    reviewerId,
    resetCount: update.count,
    cooldownDays: REVIEWER_PLACE_COOLDOWN_DAYS,
  };
}

export async function resetReviewerCampaignCooldownByReviewerId(
  reviewerId: string,
  now = new Date(),
): Promise<ReviewerCooldownResetResult | null> {
  const normalizedReviewerId = reviewerId.trim();
  if (!normalizedReviewerId) return null;

  const reviewer = await prisma.reviewer.findUnique({
    where: { id: normalizedReviewerId },
    select: { id: true },
  });
  if (!reviewer) return null;

  return resetReviewerCampaignCooldown(reviewer.id, now);
}

/**
 * Makes completed participation records ineligible for the seven-day place
 * cooldown calculation without deleting proof, point, or settlement data.
 */
export async function resetReviewerCampaignCooldownByEmail(
  email: string,
  now = new Date(),
): Promise<ReviewerCooldownResetResult | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const reviewer = await prisma.reviewer.findFirst({
    where: { email: normalizedEmail },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!reviewer) return null;

  return resetReviewerCampaignCooldown(reviewer.id, now);
}
