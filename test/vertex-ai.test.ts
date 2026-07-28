import { describe, expect, it, vi } from "vitest";
import {
  VertexAiConfigurationError,
  buildVertexAiUrl,
  parseVertexServiceAccount,
  resolveVertexAiConfig,
  sendVertexAiRequest,
} from "@/lib/vertex-ai";
import {
  ReviewDraftProviderConfigurationError,
  resolveReviewDraftProvider,
} from "@/lib/gemini-generation";

describe("Vertex AI configuration", () => {
  it("uses Gemini 3.5 Flash and the global endpoint by default", () => {
    expect(resolveVertexAiConfig({ VERTEX_AI_PROJECT_ID: "review-project" })).toEqual({
      projectId: "review-project",
      location: "global",
      model: "gemini-3.5-flash",
    });
  });

  it("rejects a missing project instead of silently falling back", () => {
    expect(() => resolveVertexAiConfig({})).toThrowError(VertexAiConfigurationError);
    try {
      resolveVertexAiConfig({});
    } catch (error) {
      expect(error).toMatchObject({ code: "VERTEX_PROJECT_REQUIRED" });
    }
  });

  it("rejects an invalid Google Cloud project ID before making a request", () => {
    expect(() => resolveVertexAiConfig({ VERTEX_AI_PROJECT_ID: "review project" })).toThrowError(
      VertexAiConfigurationError,
    );
  });

  it("rejects an unknown provider instead of silently selecting Vertex", () => {
    expect(() => resolveReviewDraftProvider({ REVIEW_DRAFT_PROVIDER: "vertx" })).toThrowError(
      ReviewDraftProviderConfigurationError,
    );
  });

  it("builds the documented Vertex publisher model endpoints", () => {
    const config = resolveVertexAiConfig({
      VERTEX_AI_PROJECT_ID: "review-project",
      VERTEX_AI_LOCATION: "asia-northeast3",
      REVIEW_DRAFT_MODEL: "gemini-3.5-flash",
    });

    expect(buildVertexAiUrl(config, "generateContent")).toBe(
      "https://asia-northeast3-aiplatform.googleapis.com/v1/projects/review-project/locations/asia-northeast3/publishers/google/models/gemini-3.5-flash:generateContent",
    );
    expect(buildVertexAiUrl({ ...config, location: "global" }, "streamGenerateContent")).toBe(
      "https://aiplatform.googleapis.com/v1/projects/review-project/locations/global/publishers/google/models/gemini-3.5-flash:streamGenerateContent?alt=sse",
    );
  });

  it("parses base64 service-account credentials without exposing the private key", () => {
    const encoded = Buffer.from(JSON.stringify({
      type: "service_account",
      project_id: "review-project",
      client_email: "vertex@review-project.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n",
    })).toString("base64");

    expect(parseVertexServiceAccount(encoded)).toEqual({
      type: "service_account",
      project_id: "review-project",
      client_email: "vertex@review-project.iam.gserviceaccount.com",
      private_key: expect.stringContaining("BEGIN PRIVATE KEY"),
    });
  });
});

describe("Vertex AI requests", () => {
  it("uses a bearer token and never places credentials in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const config = resolveVertexAiConfig({ VERTEX_AI_PROJECT_ID: "review-project" });

    await sendVertexAiRequest({
      config,
      method: "generateContent",
      accessToken: "secret-access-token",
      body: { contents: [{ role: "user", parts: [{ text: "원고 생성" }] }] },
      fetchImpl: fetchMock,
      timeoutMs: 1_000,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("secret-access-token");
    expect(init.headers).toMatchObject({
      authorization: "Bearer secret-access-token",
      "content-type": "application/json",
    });
  });
});
