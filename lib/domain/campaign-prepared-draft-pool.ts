import { prisma } from "@/lib/db";
import { generateCampaignReviewDraftPreview } from "@/lib/domain/campaign-review-draft";
import { CAMPAIGN_AUTOMATION_DRAFT_TARGET } from "@/lib/domain/campaign-automation-policy";

const MAX_ROUNDS = 12;
const MAX_STAGNANT_ROUNDS = 3;

export interface PreparedDraftPoolDependencies {
  target?: number;
  maxRounds?: number;
  maxStagnantRounds?: number;
  countUnassignedQualityDrafts: () => Promise<number>;
  generateRound: () => Promise<unknown>;
}

export interface PreparedDraftPoolResult {
  target: number;
  initialCount: number;
  finalCount: number;
  rounds: number;
  stagnantRounds: number;
  reachedTarget: boolean;
}

function targetReachedError(error: unknown) {
  return typeof error === "object" && error != null && "code" in error && error.code === "PREPARED_DRAFT_TARGET_REACHED";
}

export async function fillPreparedDraftPool(
  _campaignId: string,
  dependencies: PreparedDraftPoolDependencies,
): Promise<PreparedDraftPoolResult> {
  const target = dependencies.target ?? CAMPAIGN_AUTOMATION_DRAFT_TARGET;
  const maxRounds = dependencies.maxRounds ?? MAX_ROUNDS;
  const maxStagnantRounds = dependencies.maxStagnantRounds ?? MAX_STAGNANT_ROUNDS;
  const initialCount = await dependencies.countUnassignedQualityDrafts();
  let finalCount = initialCount;
  let rounds = 0;
  let stagnantRounds = 0;

  while (finalCount < target && rounds < maxRounds && stagnantRounds < maxStagnantRounds) {
    const beforeCount = finalCount;
    rounds += 1;
    try {
      await dependencies.generateRound();
    } catch (error) {
      if (!targetReachedError(error)) throw error;
    }
    finalCount = await dependencies.countUnassignedQualityDrafts();
    stagnantRounds = finalCount > beforeCount ? 0 : stagnantRounds + 1;
  }

  return {
    target,
    initialCount,
    finalCount,
    rounds,
    stagnantRounds,
    reachedTarget: finalCount === target,
  };
}

export async function fillCampaignPreparedDraftPool(campaignId: string) {
  const cleanCampaignId = campaignId.trim();
  if (!cleanCampaignId) throw new Error("Missing campaign id for prepared draft pool");
  return fillPreparedDraftPool(cleanCampaignId, {
    countUnassignedQualityDrafts: () => prisma.campaignPreparedDraft.count({
      where: { campaignId: cleanCampaignId, qualityPassed: true, assignedReceiptId: null },
    }),
    generateRound: () => generateCampaignReviewDraftPreview(cleanCampaignId),
  });
}
