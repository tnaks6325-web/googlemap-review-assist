import { describe, expect, it } from "vitest";
import { filterAdminReviewProofs, parseReviewProofAnalysisChecks } from "@/lib/domain/admin";

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

  it("filters the pending queue for manual review and unavailable OCR", () => {
    const rows = [
      { id: "approved", analysisStatus: "AUTO_APPROVE", extractedText: "review text" },
      { id: "manual", analysisStatus: "MANUAL_REVIEW", extractedText: "partial text" },
      { id: "missing", analysisStatus: "UNAVAILABLE", extractedText: null },
    ];

    expect(filterAdminReviewProofs(rows, "MANUAL_REVIEW").map((row) => row.id)).toEqual(["manual", "missing"]);
    expect(filterAdminReviewProofs(rows, "OCR_UNAVAILABLE").map((row) => row.id)).toEqual(["missing"]);
  });
});
