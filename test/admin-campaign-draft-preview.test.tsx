import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AdminCampaignDraftPreview,
  DraftGenerationProgress,
  consumeDraftGenerationStream,
  deletePreparedDraftRequest,
  runCampaignDraftAutofill,
  updatePreparedDraftRequest,
} from "@/components/admin/AdminCampaignDraftPreview";

describe("admin campaign prepared drafts", () => {
  it("protects individual draft update and delete routes with admin authorization", () => {
    const routeSource = readFileSync(
      new URL(
        "../app/api/admin/campaigns/[campaignId]/drafts/[draftId]/route.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(routeSource).toContain("export async function PATCH");
    expect(routeSource).toContain("export async function DELETE");
    expect(routeSource).toContain("checkOrigin(req)");
    expect(routeSource).toContain("getAdminId()");
    expect(routeSource).toContain("updateCampaignPreparedDraft");
    expect(routeSource).toContain("deleteCampaignPreparedDraft");
  });

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

  it("sends an individual draft edit through the protected PATCH contract", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      draft: {
        id: "draft-1",
        text: "수정된 원고입니다.",
        qualityPassed: true,
        status: "UNASSIGNED",
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(updatePreparedDraftRequest({
      campaignId: "campaign 1",
      draftId: "draft/1",
      text: "수정된 원고입니다.",
      fetcher,
    })).resolves.toMatchObject({ id: "draft-1", status: "UNASSIGNED" });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/campaigns/campaign%201/drafts/draft%2F1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ text: "수정된 원고입니다." }),
      }),
    );
  });

  it("sends an individual draft delete and surfaces server errors", async () => {
    const successFetcher = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ deletedId: "draft-1" }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    await expect(deletePreparedDraftRequest({
      campaignId: "campaign-1",
      draftId: "draft-1",
      fetcher: successFetcher,
    })).resolves.toEqual({ deletedId: "draft-1" });

    const failureFetcher = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: "이미 배정된 원고입니다." } }),
      { status: 409, headers: { "content-type": "application/json" } },
    ));
    await expect(deletePreparedDraftRequest({
      campaignId: "campaign-1",
      draftId: "draft-2",
      fetcher: failureFetcher,
    })).rejects.toThrow("이미 배정된 원고입니다.");
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
