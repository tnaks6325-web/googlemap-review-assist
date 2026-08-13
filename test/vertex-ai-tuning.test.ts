import { describe, expect, it } from "vitest";
import { resolveReviewDraftProvider } from "@/lib/gemini-generation";
import { buildVertexTunedEndpointUrl } from "@/lib/vertex-ai";
import { buildVertexTuningJobUrl } from "@/lib/vertex-ai-tuning";

describe("Vertex tuning endpoints", () => {
  it("keeps the current Gemini provider as the default until Vertex is explicitly enabled", () => {
    expect(resolveReviewDraftProvider({})).toBe("gemini");
    expect(resolveReviewDraftProvider({ REVIEW_DRAFT_PROVIDER: "vertex" })).toBe("vertex");
  });

  it("uses the us-central1 tuning collection and server-returned resource name", () => {
    expect(buildVertexTuningJobUrl("review-project")).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/review-project/locations/us-central1/tuningJobs",
    );
    expect(buildVertexTuningJobUrl("review-project", "projects/review-project/locations/us-central1/tuningJobs/42"))
      .toBe("https://us-central1-aiplatform.googleapis.com/v1/projects/review-project/locations/us-central1/tuningJobs/42");
  });

  it("uses the regional serving host for a promoted tuned endpoint", () => {
    expect(buildVertexTunedEndpointUrl("projects/review-project/locations/us/endpoints/123", "generateContent"))
      .toBe("https://aiplatform.us.rep.googleapis.com/v1/projects/review-project/locations/us/endpoints/123:generateContent");
  });
});
