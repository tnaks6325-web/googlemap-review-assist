import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdminCampaignDraftPreview,
  DraftGenerationProgress,
  consumeDraftGenerationStream,
} from "@/components/admin/AdminCampaignDraftPreview";

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

  it("renders the generation button as a live progress bar", () => {
    const html = renderToStaticMarkup(
      <DraftGenerationProgress current={9} target={25} />,
    );

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="9"');
    expect(html).toContain('width:36%');
    expect(html).toContain("원고생성 9/25");
  });

  it("consumes streamed draft counts before the generation result arrives", async () => {
    const progress: number[] = [];
    const response = new Response(
      [
        JSON.stringify({ type: "progress", generatedCount: 1, targetCount: 25 }),
        JSON.stringify({ type: "progress", generatedCount: 8, targetCount: 25 }),
        JSON.stringify({ type: "complete" }),
      ].join("\n"),
      { status: 200 },
    );

    await consumeDraftGenerationStream(response, (count) => progress.push(count));

    expect(progress).toEqual([1, 8]);
  });
});
