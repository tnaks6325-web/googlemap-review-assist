import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdminCampaignDraftPreview,
  DraftGenerationProgress,
  consumeDraftGenerationStream,
  runCampaignDraftAutofill,
} from "@/components/admin/AdminCampaignDraftPreview";

describe("admin campaign prepared drafts", () => {
  it("allows the streaming generation route to run through both Gemini attempts", () => {
    const routeSource = readFileSync(
      new URL(
        "../app/api/admin/campaigns/[campaignId]/draft-preview/route.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(routeSource).toContain("export const maxDuration = 300;");
  });

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
      <DraftGenerationProgress current={3} target={25} attempted={9} attemptTarget={25} />,
    );

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('width:12%');
    expect(html).toContain("원고생성 3/25");
    expect(html).toContain("작성 9/25");
  });

  it("continues generation rounds until 25 quality-passed unassigned drafts exist", async () => {
    const storedCounts = [8, 18, 25];
    let round = 0;

    const result = await runCampaignDraftAutofill({
      initialUnassignedCount: 2,
      generateRound: async () => {
        round += 1;
      },
      loadHistory: async () => ({
        campaignId: "campaign-1",
        hasMore: false,
        metrics: {
          totalCount: storedCounts[round - 1],
          unassignedCount: storedCounts[round - 1],
          qualityExcludedCount: 0,
          assignedCount: 0,
          batchCount: round,
        },
        items: [],
      }),
    });

    expect(round).toBe(3);
    expect(result.metrics.unassignedCount).toBe(25);
  });

  it("retries a transient generation interruption without resetting stored progress", async () => {
    let attempts = 0;
    const result = await runCampaignDraftAutofill({
      initialUnassignedCount: 20,
      generateRound: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary connection interruption");
      },
      loadHistory: async () => ({
        campaignId: "campaign-1",
        hasMore: false,
        metrics: {
          totalCount: 25,
          unassignedCount: 25,
          qualityExcludedCount: 0,
          assignedCount: 0,
          batchCount: 2,
        },
        items: [],
      }),
    });

    expect(attempts).toBe(2);
    expect(result.metrics.unassignedCount).toBe(25);
  });

  it("consumes streamed draft counts before the generation result arrives", async () => {
    const progress: number[] = [];
    const response = new Response(
      [
        JSON.stringify({ type: "progress", generatedCount: 2, targetCount: 25 }),
        JSON.stringify({ type: "progress", generatedCount: 3, targetCount: 25 }),
        JSON.stringify({ type: "progress", generatedCount: 4, targetCount: 25 }),
        JSON.stringify({ type: "progress", generatedCount: 5, targetCount: 25 }),
        JSON.stringify({ type: "complete" }),
      ].join("\n"),
      { status: 200 },
    );

    await consumeDraftGenerationStream(response, (count) => progress.push(count));

    expect(progress).toEqual([2, 3, 4, 5]);
  });
});
