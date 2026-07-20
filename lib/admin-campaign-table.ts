export type AdminCampaignStatusFilter =
  | "all"
  | "active"
  | "attention"
  | "ready"
  | "inactive";

export interface AdminCampaignFilterRow {
  businessName: string;
  campaignName: string;
  address: string | null;
  category: string | null;
  active: boolean;
  canGenerateReviewDraft: boolean;
  naverPlace: { matchStatus: string } | null;
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
