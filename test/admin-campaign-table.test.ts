import { describe, expect, it } from "vitest";
import {
  adminCampaignAutomationPlan,
  automaticNaverCampaignIds,
  filterAdminCampaignRows,
  operationalCampaignStatus,
  type AdminCampaignFilterRow,
} from "@/lib/admin-campaign-table";

function campaign(
  overrides: Partial<AdminCampaignFilterRow> = {},
): AdminCampaignFilterRow {
  return {
    businessName: "로우파이브안국",
    campaignName: "안국 방문 캠페인",
    address: "서울특별시 종로구 재동 60",
    category: "음식점",
    active: true,
    isAvailableToday: false,
    availabilityReason: "SOURCE_NOT_READY",
    canGenerateReviewDraft: false,
    naverPlace: { matchStatus: "NEEDS_REVIEW" },
    ...overrides,
  };
}

describe("admin campaign table", () => {
  it("selects unresolved Naver campaigns for automatic linking once per business", () => {
    expect(
      automaticNaverCampaignIds([
        {
          id: "campaign-1",
          businessId: "business-1",
          hasGooglePlace: true,
          naverPlace: null,
        },
        {
          id: "campaign-2",
          businessId: "business-1",
          hasGooglePlace: true,
          naverPlace: { matchStatus: "NEEDS_REVIEW" },
        },
        {
          id: "campaign-3",
          businessId: "business-2",
          hasGooglePlace: true,
          naverPlace: { matchStatus: "NEEDS_REVIEW" },
        },
        {
          id: "campaign-4",
          businessId: "business-3",
          hasGooglePlace: true,
          naverPlace: { matchStatus: "LINKED" },
        },
        {
          id: "campaign-5",
          businessId: "business-4",
          hasGooglePlace: false,
          naverPlace: null,
        },
      ]),
    ).toEqual(["campaign-1", "campaign-3"]);
  });

  it("plans one Naver correction per business and reference collection per campaign", () => {
    expect(
      adminCampaignAutomationPlan([
        {
          id: "campaign-1",
          businessId: "business-1",
          hasGooglePlace: true,
          naverPlace: null,
        },
        {
          id: "campaign-2",
          businessId: "business-1",
          hasGooglePlace: true,
          naverPlace: { matchStatus: "NEEDS_REVIEW" },
        },
        {
          id: "campaign-3",
          businessId: "business-2",
          hasGooglePlace: true,
          naverPlace: { matchStatus: "LINKED" },
        },
      ]),
    ).toEqual({
      naverCampaignIds: ["campaign-1"],
      referenceCampaignIds: ["campaign-1", "campaign-2", "campaign-3"],
    });
  });

  it("marks an active campaign requiring source review as needing attention", () => {
    expect(operationalCampaignStatus(campaign())).toEqual({
      key: "attention",
      label: "보정 필요",
      tone: "warning",
    });
  });

  it("shows schedule and quota states before source readiness", () => {
    expect(
      operationalCampaignStatus(
        campaign({
          isAvailableToday: false,
          availabilityReason: "BEFORE_START_DATE",
          canGenerateReviewDraft: true,
        }),
      ),
    ).toMatchObject({ key: "scheduled", label: "운영 예정" });
    expect(
      operationalCampaignStatus(
        campaign({
          isAvailableToday: false,
          availabilityReason: "DAILY_QUOTA_REACHED",
          canGenerateReviewDraft: true,
        }),
      ),
    ).toMatchObject({ key: "daily_full", label: "오늘 마감" });
    expect(
      operationalCampaignStatus(
        campaign({
          isAvailableToday: false,
          availabilityReason: "TOTAL_QUOTA_REACHED",
          canGenerateReviewDraft: true,
        }),
      ),
    ).toMatchObject({ key: "total_full", label: "전체 마감" });
  });

  it("marks an inactive campaign as paused before considering source readiness", () => {
    expect(
      operationalCampaignStatus(
        campaign({ active: false, canGenerateReviewDraft: true }),
      ),
    ).toEqual({
      key: "inactive",
      label: "중지됨",
      tone: "neutral",
    });
  });

  it("filters campaigns by status and normalized Korean search text", () => {
    const rows = [
      campaign(),
      campaign({
        businessName: "블리비의원 건대점",
        campaignName: "건대 방문 캠페인",
        address: "서울특별시 광진구 아차산로",
        category: "의원",
        canGenerateReviewDraft: true,
        naverPlace: { matchStatus: "CONFIRMED" },
      }),
    ];

    expect(filterAdminCampaignRows(rows, " 건대점 ", "ready")).toEqual([
      rows[1],
    ]);
    expect(filterAdminCampaignRows(rows, "종로구", "attention")).toEqual([
      rows[0],
    ]);
  });
});
