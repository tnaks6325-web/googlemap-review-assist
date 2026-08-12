export const CAMPAIGN_PREPARED_DRAFT_RESERVE_COUNT = 5;

export function campaignPreparedDraftReserveTarget(
  totalQuota: number | null | undefined,
): number {
  const quota = Math.max(1, totalQuota ?? CAMPAIGN_PREPARED_DRAFT_RESERVE_COUNT);
  return Math.min(quota, CAMPAIGN_PREPARED_DRAFT_RESERVE_COUNT);
}
