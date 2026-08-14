import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AdminCampaignDraftPreview,
  DraftGenerationProgress,
  PreparedDraftReviewRequiredError,
  consumeDraftGenerationStream,
  deletePreparedDraftRequest,
  deleteQualityExcludedDraftsRequest,
  promotePreparedDraftRequest,
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
    expect(routeSource).toContain("CampaignReviewDraftWarningError");
    expect(routeSource).toContain("warnings: error.warnings");
    expect(routeSource).toContain("force: body.force === true");
    expect(routeSource).toContain("const authorization = await authorizeMutation(req);");
    expect(routeSource).toContain("draft?.qualityPassed === false");
    expect(routeSource).toContain('authorizeRateLimitedMutation(req, "promote", authorization)');
    expect(routeSource).toContain("admin:prepared-draft:${action}:${adminId}:${clientIp(req)}");
  });

  it("protects the quality-excluded bulk delete route with admin authorization", () => {
    const routeSource = readFileSync(
      new URL(
        "../app/api/admin/campaigns/[campaignId]/drafts/quality-excluded/route.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(routeSource).toContain("export async function DELETE");
    expect(routeSource).toContain("checkOrigin(req)");
    expect(routeSource).toContain("getAdminId()");
    expect(routeSource).toContain("deleteCampaignQualityExcludedDrafts");
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

  it("renders separate generation and archive buttons with reserve-draft progress", () => {
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

    expect(html).toContain("원고생성 3/8");
    expect(html).toContain("원고보관함");
    expect(html).not.toContain("원고생성 테스트");
  });

  it("표시 목표에 코드 총량과 최소 여분을 반영한다", () => {
    const html = renderToStaticMarkup(
      <AdminCampaignDraftPreview
        campaignId="campaign-1"
        businessName="테스트 매장"
        totalQuota={2}
        initialMetrics={{
          totalCount: 0,
          unassignedCount: 0,
          qualityExcludedCount: 0,
          assignedCount: 0,
          batchCount: 0,
        }}
      />,
    );

    expect(html).toContain("원고생성 0/5");
    expect(html).not.toContain("원고생성 0/2");
  });

  it("offers quality-excluded promotion and confirmed bulk deletion controls", () => {
    const componentSource = readFileSync(
      new URL("../components/admin/AdminCampaignDraftPreview.tsx", import.meta.url),
      "utf8",
    );

    expect(componentSource).toContain("미배정으로 이동");
    expect(componentSource).toContain("품질제외 모두 삭제");
    expect(componentSource).toContain("삭제한 원고는 복구할 수 없습니다");
    expect(componentSource).toContain("경고 무시하고 반영");
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

  it("preserves edit warnings and sends an explicit force override", async () => {
    const warningFetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: "DRAFT_REVIEW_REQUIRED",
        message: "품질 경고를 확인해 주세요.",
        warnings: ["자연스러운 해요체 종결이 이미 7건 사용되었습니다."],
      },
    }), { status: 409, headers: { "content-type": "application/json" } }));

    const warning = await updatePreparedDraftRequest({
      campaignId: "campaign-1",
      draftId: "draft-1",
      text: "관리자가 검토 중인 충분한 길이의 원고를 저장하려고 합니다.",
      fetcher: warningFetcher,
    }).catch((error: unknown) => error);
    expect(warning).toBeInstanceOf(PreparedDraftReviewRequiredError);
    expect(warning).toMatchObject({
      warnings: ["자연스러운 해요체 종결이 이미 7건 사용되었습니다."],
    });

    const forceFetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      draft: { id: "draft-1", text: "강제 반영 원고입니다.", qualityPassed: true, status: "UNASSIGNED" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await updatePreparedDraftRequest({
      campaignId: "campaign-1",
      draftId: "draft-1",
      text: "관리자가 검토 중인 충분한 길이의 원고를 저장하려고 합니다.",
      force: true,
      fetcher: forceFetcher,
    });
    expect(forceFetcher).toHaveBeenCalledWith(
      "/api/admin/campaigns/campaign-1/drafts/draft-1",
      expect.objectContaining({
        body: JSON.stringify({
          text: "관리자가 검토 중인 충분한 길이의 원고를 저장하려고 합니다.",
          force: true,
        }),
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

  it("moves a quality-excluded draft into the unassigned pool", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      draft: { id: "draft-1", text: "검토한 원고입니다.", qualityPassed: true, status: "UNASSIGNED" },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(promotePreparedDraftRequest({ campaignId: "campaign-1", draftId: "draft-1", fetcher }))
      .resolves.toMatchObject({ id: "draft-1", status: "UNASSIGNED" });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/campaigns/campaign-1/drafts/draft-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ action: "PROMOTE_TO_UNASSIGNED" }),
      }),
    );
  });

  it("preserves promotion warnings and sends an explicit force override", async () => {
    const warningFetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: "DRAFT_REVIEW_REQUIRED",
        message: "품질 경고를 확인해 주세요.",
        warnings: ["품질 검사에서 제외된 원고입니다."],
      },
    }), { status: 409, headers: { "content-type": "application/json" } }));
    await expect(promotePreparedDraftRequest({
      campaignId: "campaign-1",
      draftId: "draft-1",
      fetcher: warningFetcher,
    })).rejects.toBeInstanceOf(PreparedDraftReviewRequiredError);

    const forceFetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      draft: { id: "draft-1", text: "검토한 원고입니다.", qualityPassed: true, status: "UNASSIGNED" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await promotePreparedDraftRequest({
      campaignId: "campaign-1",
      draftId: "draft-1",
      force: true,
      fetcher: forceFetcher,
    });
    expect(forceFetcher).toHaveBeenCalledWith(
      "/api/admin/campaigns/campaign-1/drafts/draft-1",
      expect.objectContaining({
        body: JSON.stringify({ action: "PROMOTE_TO_UNASSIGNED", force: true }),
      }),
    );
  });

  it("deletes all quality-excluded drafts through the dedicated endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ deletedCount: 7 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    await expect(deleteQualityExcludedDraftsRequest({ campaignId: "campaign 1", fetcher }))
      .resolves.toEqual({ deletedCount: 7 });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/campaigns/campaign%201/drafts/quality-excluded",
      { method: "DELETE" },
    );
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

  it("continues generation rounds until a 50-code campaign has its 60-draft buffer", async () => {
    const storedCounts = [25, 50, 60];
    let round = 0;

    const result = await runCampaignDraftAutofill({
      initialUnassignedCount: 0,
      targetCount: 60,
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
    expect(result.metrics.unassignedCount).toBe(60);
  });

  it("retries a transient generation interruption without resetting stored progress", async () => {
    let attempts = 0;
    const result = await runCampaignDraftAutofill({
      initialUnassignedCount: 20,
      targetCount: 25,
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
