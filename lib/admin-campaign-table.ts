import type { CampaignAvailabilityReason } from "@/lib/domain/campaign-availability-policy";

export type AdminCampaignStatusFilter =
  | "all"
  | "active"
  | "attention"
  | "ready"
  | "inactive"
  | "scheduled"
  | "ended"
  | "daily_full"
  | "total_full";

export interface AdminCampaignFilterRow {
  businessName: string;
  campaignName: string;
  address: string | null;
  category: string | null;
  active: boolean;
  isAvailableToday: boolean;
  availabilityReason: CampaignAvailabilityReason;
  canGenerateReviewDraft: boolean;
  naverPlace: { matchStatus: string } | null;
}

export interface AdminCampaignNaverAutoLinkRow {
  id: string;
  businessId: string;
  hasGooglePlace: boolean;
  naverPlace: { matchStatus: string } | null;
}

export function automaticNaverCampaignIds(
  campaigns: AdminCampaignNaverAutoLinkRow[],
) {
  const selectedBusinessIds = new Set<string>();
  const campaignIds: string[] = [];

  for (const campaign of campaigns) {
    if (
      !campaign.hasGooglePlace ||
      (campaign.naverPlace &&
        campaign.naverPlace.matchStatus !== "NEEDS_REVIEW") ||
      selectedBusinessIds.has(campaign.businessId)
    ) {
      continue;
    }

    selectedBusinessIds.add(campaign.businessId);
    campaignIds.push(campaign.id);
  }

  return campaignIds;
}

export function operationalCampaignStatus(
  campaign: AdminCampaignFilterRow,
) {
  if (!campaign.active) {
    return {
      key: "inactive" as const,
      label: "중지됨",
      tone: "neutral" as const,
    };
  }

  if (campaign.availabilityReason === "INVALID_CONFIGURATION") {
    return {
      key: "attention" as const,
      label: "보정 필요",
      tone: "warning" as const,
    };
  }
  if (campaign.availabilityReason === "BEFORE_START_DATE") {
    return {
      key: "scheduled" as const,
      label: "운영 예정",
      tone: "neutral" as const,
    };
  }
  if (campaign.availabilityReason === "AFTER_END_DATE") {
    return {
      key: "ended" as const,
      label: "운영 종료",
      tone: "neutral" as const,
    };
  }
  if (campaign.availabilityReason === "TOTAL_QUOTA_REACHED") {
    return {
      key: "total_full" as const,
      label: "전체 마감",
      tone: "neutral" as const,
    };
  }
  if (campaign.availabilityReason === "DAILY_QUOTA_REACHED") {
    return {
      key: "daily_full" as const,
      label: "오늘 마감",
      tone: "warning" as const,
    };
  }

  if (
    !campaign.canGenerateReviewDraft ||
    campaign.naverPlace?.matchStatus === "NEEDS_REVIEW"
  ) {
    return {
      key: "attention" as const,
      label: "보정 필요",
      tone: "warning" as const,
    };
  }

  return {
    key: "ready" as const,
    label: "진행 중",
    tone: "brand" as const,
  };
}

export function filterAdminCampaignRows<T extends AdminCampaignFilterRow>(
  campaigns: T[],
  query: string,
  status: AdminCampaignStatusFilter,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");

  return campaigns.filter((campaign) => {
    const campaignStatus = operationalCampaignStatus(campaign);
    const statusMatches =
      status === "all" ||
      (status === "active" && campaign.active) ||
      campaignStatus.key === status;
    if (!statusMatches) return false;
    if (!normalizedQuery) return true;

    return [
      campaign.businessName,
      campaign.campaignName,
      campaign.address,
      campaign.category,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ko-KR")
      .includes(normalizedQuery);
  });
}
