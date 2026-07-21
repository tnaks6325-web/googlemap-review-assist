import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminCampaignDraftPreview } from "@/components/admin/AdminCampaignDraftPreview";

describe("admin campaign prepared drafts", () => {
  it("renders separate generation and archive buttons with 25-draft progress", () => {
    const html = renderToStaticMarkup(
      <AdminCampaignDraftPreview
        campaignId="campaign-1"
        businessName="테스트 매장"
        initialMetrics={{
          totalCount: 12,
          unassignedCount: 3,
          qualityExcludedCount: 7,
          assignedCount: 2,
          batchCount: 1,
        }}
      />,
    );

    expect(html).toContain("원고생성 3/25");
    expect(html).toContain("원고보관함");
    expect(html).not.toContain("원고생성 테스트");
  });
});
