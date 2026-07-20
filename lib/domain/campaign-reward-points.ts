export const MIN_CAMPAIGN_REWARD_POINTS = 1;
export const MAX_CAMPAIGN_REWARD_POINTS = 100_000;

export function parseCampaignRewardPoints(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_CAMPAIGN_REWARD_POINTS ||
    value > MAX_CAMPAIGN_REWARD_POINTS
  ) {
    return null;
  }
  return value;
}
