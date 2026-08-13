/** Fallback campaign code count for legacy rows that have no quota yet. */
export const CAMPAIGN_PREPARED_DRAFT_RESERVE_COUNT = 5;
export const CAMPAIGN_PREPARED_DRAFT_RESERVE_RATE = 0.2;
export const CAMPAIGN_PREPARED_DRAFT_RESERVE_MINIMUM = 3;

export function campaignPreparedDraftReserveTarget(
  totalQuota: number | null | undefined,
): number {
  const rawQuota = totalQuota == null ? Number.NaN : Number(totalQuota);
  const quota = Number.isFinite(rawQuota)
    ? Math.max(1, Math.floor(rawQuota))
    : CAMPAIGN_PREPARED_DRAFT_RESERVE_COUNT;
  const reserve = Math.max(
    Math.ceil(quota * CAMPAIGN_PREPARED_DRAFT_RESERVE_RATE),
    CAMPAIGN_PREPARED_DRAFT_RESERVE_MINIMUM,
  );
  return quota + reserve;
}
