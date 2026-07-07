import { describe, expect, it } from "vitest";
import { parseReviewProofAnalysisChecks } from "@/lib/domain/admin";

describe("admin review proof checks", () => {
  it("parses AI check statuses from stored review proof analysis JSON", () => {
    const checks = parseReviewProofAnalysisChecks(
      JSON.stringify({
        checks: {
          placeName: "PASS",
          rating: "FAIL",
          recency: "UNKNOWN",
        },
      }),
    );

    expect(checks).toEqual({
      placeName: "PASS",
      rating: "FAIL",
      recency: "UNKNOWN",
    });
  });

  it("falls back to UNKNOWN for missing or invalid individual check values", () => {
    const checks = parseReviewProofAnalysisChecks(
      JSON.stringify({
        checks: {
          placeName: "PASS",
          rating: "BAD_VALUE",
        },
      }),
    );

    expect(checks).toEqual({
      placeName: "PASS",
      rating: "UNKNOWN",
      recency: "UNKNOWN",
    });
  });

  it("returns null for legacy rows without check metadata", () => {
    expect(parseReviewProofAnalysisChecks(null)).toBeNull();
    expect(parseReviewProofAnalysisChecks("{bad json")).toBeNull();
    expect(parseReviewProofAnalysisChecks(JSON.stringify({ status: "MANUAL_REVIEW" }))).toBeNull();
  });
});
