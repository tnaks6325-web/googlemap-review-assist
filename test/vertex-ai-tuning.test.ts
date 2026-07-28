import { describe, expect, it } from "vitest";
import { buildVertexTuningJobUrl } from "@/lib/vertex-ai-tuning";
import { buildVertexTunedEndpointUrl } from "@/lib/vertex-ai";

describe("Vertex tuning endpoints", () => {
  it("uses the supported us-central1 tuning collection", () => {
    expect(buildVertexTuningJobUrl("ageless-impulse-486913-f7")).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/ageless-impulse-486913-f7/locations/us-central1/tuningJobs",
    );
  });

  it("uses the server-returned resource name for reads", () => {
    expect(buildVertexTuningJobUrl("project-12345", "projects/project-12345/locations/us-central1/tuningJobs/42"))
      .toBe("https://us-central1-aiplatform.googleapis.com/v1/projects/project-12345/locations/us-central1/tuningJobs/42");
  });

  it("routes a promoted US multi-region endpoint through the regional serving host", () => {
    expect(buildVertexTunedEndpointUrl(
      "projects/project-12345/locations/us/endpoints/123",
      "generateContent",
    )).toBe("https://aiplatform.us.rep.googleapis.com/v1/projects/project-12345/locations/us/endpoints/123:generateContent");
  });
});
