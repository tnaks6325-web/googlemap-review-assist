import { describe, expect, it } from "vitest";
import {
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
    canGenerateReviewDraft: false,
    naverPlace: { matchStatus: "NEEDS_REVIEW" },
    ...overrides,
  };
}

describe("admin campaign table", () => {
  it("marks an active campaign requiring source review as needing attention", () => {
    expect(operationalCampaignStatus(campaign())).toEqual({
      key: "attention",
      label: "보정 필요",
      tone: "warning",
    });
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
