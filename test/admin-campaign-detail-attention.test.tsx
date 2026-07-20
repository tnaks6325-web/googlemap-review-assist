import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminCampaignBlogReferences } from "@/components/admin/AdminCampaignBlogReferences";
import { AdminCampaignDraftGuidance } from "@/components/admin/AdminCampaignDraftGuidance";
import { AdminCampaignNaverCandidates } from "@/components/admin/AdminCampaignNaverCandidates";

describe("admin campaign detail attention borders", () => {
  it("highlights an unresolved Naver Place card", () => {
    const html = renderToStaticMarkup(
      <AdminCampaignNaverCandidates
        campaignId="campaign-1"
        hasGooglePlace
        initialPlace={null}
      />,
    );

    expect(html).toContain("border-amber-200");
  });

  it("highlights the blog reference card only when no references are saved", () => {
    const emptyHtml = renderToStaticMarkup(
      <AdminCampaignBlogReferences
        campaignId="campaign-1"
        initialReferences={[]}
        initialCount={0}
      />,
    );
    const readyHtml = renderToStaticMarkup(
      <AdminCampaignBlogReferences
        campaignId="campaign-1"
        initialReferences={[]}
        initialCount={10}
      />,
    );

    expect(emptyHtml).toContain("border-amber-200");
    expect(readyHtml).not.toContain("border-amber-200");
  });

  it("highlights draft guidance only when every guidance source is empty", () => {
    const emptyHtml = renderToStaticMarkup(
      <AdminCampaignDraftGuidance
        campaignId="campaign-1"
        initialGuidance={{
          industry: null,
          approvedFacts: [],
          bannedTerms: [],
          guideKeywords: [],
          reviewExamples: [],
        }}
      />,
    );
    const readyHtml = renderToStaticMarkup(
      <AdminCampaignDraftGuidance
        campaignId="campaign-1"
        initialGuidance={{
          industry: null,
          approvedFacts: [],
          bannedTerms: [],
          guideKeywords: ["제주 흑돼지"],
          reviewExamples: [],
        }}
      />,
    );

    expect(emptyHtml).toContain("border-amber-200");
    expect(readyHtml).not.toContain("border-amber-200");
    expect(emptyHtml).toContain("원고 사실 카드");
    expect(emptyHtml).toContain("자료 분석");
  });
});
