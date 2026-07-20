export const CAMPAIGN_ASSIGNMENT_TTL_MS = 5 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type CampaignAvailabilityReason =
  | "AVAILABLE"
  | "INACTIVE"
  | "INVALID_CONFIGURATION"
  | "BEFORE_START_DATE"
  | "AFTER_END_DATE"
  | "TOTAL_QUOTA_REACHED"
  | "DAILY_QUOTA_REACHED"
  | "SOURCE_NOT_READY";

export interface CampaignAvailabilityInput {
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  totalQuota: number | null;
  dailyQuota: number | null;
  assignedCount: number;
  assignedTodayCount: number;
  sourceReady: boolean;
}

export interface CampaignAvailabilityResult {
  isAvailableToday: boolean;
  availabilityReason: CampaignAvailabilityReason;
  remainingTodayCount: number;
  remainingTotalCount: number;
}

export function normalizeSheetDate(value: string | null | undefined) {
  const source = value?.trim();
  if (!source || source === "-") return null;
  const match = source.match(/^(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\.?$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function kstDateKey(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function kstDayWindow(now = new Date()) {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const start = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - KST_OFFSET_MS,
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function assignmentExpiry(createdAt: Date) {
  return new Date(createdAt.getTime() + CAMPAIGN_ASSIGNMENT_TTL_MS);
}

export function isEffectiveCampaignAssignment(
  assignment: {
    status: string;
    assignmentExpiresAt: Date | null;
    reviewProofSubmittedAt: Date | null;
    createdAt?: Date;
  },
  now = new Date(),
) {
  if (assignment.status === "EXPIRED") return false;
  if (["REVIEW_SUBMITTED", "COMPLETED"].includes(assignment.status)) return true;
  if (assignment.status === "REJECTED") return Boolean(assignment.reviewProofSubmittedAt);
  if (!["ASSIGNED", "VERIFIED"].includes(assignment.status)) return false;

  const expiresAt =
    assignment.assignmentExpiresAt ??
    (assignment.createdAt ? assignmentExpiry(assignment.createdAt) : null);
  return Boolean(expiresAt && expiresAt.getTime() > now.getTime());
}

export function campaignAvailability(
  input: CampaignAvailabilityInput,
  now = new Date(),
): CampaignAvailabilityResult {
  const remainingTodayCount = Math.max(0, (input.dailyQuota ?? 0) - input.assignedTodayCount);
  const remainingTotalCount = Math.max(0, (input.totalQuota ?? 0) - input.assignedCount);
  const result = (availabilityReason: CampaignAvailabilityReason): CampaignAvailabilityResult => ({
    isAvailableToday: availabilityReason === "AVAILABLE",
    availabilityReason,
    remainingTodayCount,
    remainingTotalCount,
  });

  if (!input.active) return result("INACTIVE");
  if (
    !input.startDate ||
    !input.endDate ||
    !input.totalQuota ||
    !input.dailyQuota ||
    input.totalQuota < 1 ||
    input.dailyQuota < 1 ||
    input.dailyQuota > input.totalQuota ||
    input.startDate > input.endDate
  ) {
    return result("INVALID_CONFIGURATION");
  }

  const today = kstDateKey(now);
  if (today < input.startDate) return result("BEFORE_START_DATE");
  if (today > input.endDate) return result("AFTER_END_DATE");
  if (input.assignedCount >= input.totalQuota) return result("TOTAL_QUOTA_REACHED");
  if (input.assignedTodayCount >= input.dailyQuota) return result("DAILY_QUOTA_REACHED");
  if (!input.sourceReady) return result("SOURCE_NOT_READY");
  return result("AVAILABLE");
}
