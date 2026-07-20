import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminCampaignNaverCandidates } from "@/components/admin/AdminCampaignNaverCandidates";

describe("admin campaign Naver candidates", () => {
  it("shows a saved Place ID without an always-active correction input", () => {
    const html = renderToStaticMarkup(
      <AdminCampaignNaverCandidates
        campaignId="campaign-1"
        hasGooglePlace
        initialPlace={{
          externalId: "2059222523",
          name: "영끌피자 용산점",
          url: "https://map.naver.com/p/entry/place/2059222523",
          address: "서울특별시 용산구 한강대로11길 21",
          category: "음식점>피자",
          matchStatus: "LINKED",
          matchConfidence: 100,
          syncedAt: "2026-07-20T00:00:00.000Z",
        }}
      />,
    );

    expect(html).toContain("저장된 Place ID");
    expect(html).toContain("2059222523");
    expect(html).not.toContain('aria-label="네이버 플레이스 ID"');
  });

  it("keeps the correction input available when no Place ID is connected", () => {
    const html = renderToStaticMarkup(
      <AdminCampaignNaverCandidates
        campaignId="campaign-1"
        hasGooglePlace
        initialPlace={null}
      />,
    );

    expect(html).toContain('aria-label="네이버 플레이스 ID"');
  });
});
