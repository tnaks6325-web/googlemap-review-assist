import { describe, expect, it } from "vitest";
import {
  NaverVisitorReviewPreviewError,
  normalizeNaverVisitorReviewPreviews,
  parseNaverVisitorReviewInput,
} from "@/lib/domain/naver-visitor-review-preview";

describe("Naver visitor review preview input", () => {
  it("accepts a Naver place entry URL and exposes its numeric place id", () => {
    expect(parseNaverVisitorReviewInput("https://map.naver.com/p/entry/place/1383953093")).toEqual({
      placeId: "1383953093",
      sourceUrl: "https://map.naver.com/p/entry/place/1383953093",
      visitorReviewUrl: "https://pcmap.place.naver.com/restaurant/1383953093/review/visitor",
    });
  });

  it("accepts a direct visitor-review URL and a numeric id", () => {
    expect(parseNaverVisitorReviewInput("https://pcmap.place.naver.com/restaurant/1383953093/review/visitor").placeId).toBe("1383953093");
    expect(parseNaverVisitorReviewInput("1383953093").visitorReviewUrl).toContain("/1383953093/review/visitor");
  });

  it("rejects non-Naver URLs and invalid ids", () => {
    expect(() => parseNaverVisitorReviewInput("https://example.com/place/1383953093")).toThrow(NaverVisitorReviewPreviewError);
    expect(() => parseNaverVisitorReviewInput("abc")).toThrow("NAVER_PLACE_INPUT_INVALID");
  });
});

describe("Naver visitor review preview normalization", () => {
  it("keeps at most ten safe preview cards", () => {
    const result = normalizeNaverVisitorReviewPreviews(
      Array.from({ length: 12 }, (_, index) => ({
        authorMasked: `reviewer-${index}`,
        content: `  Review ${index}  `,
        rating: 5,
        visitDate: "2026.08.18.",
        verificationMethod: "visitor",
      })),
    );

    expect(result).toHaveLength(10);
    expect(result[0]).toMatchObject({ ordinal: 1, content: "Review 0", rating: 5 });
    expect(result[9]?.ordinal).toBe(10);
  });

  it("drops empty cards and caps untrusted fields", () => {
    const result = normalizeNaverVisitorReviewPreviews([
      { authorMasked: "x".repeat(200), content: "", rating: 5 },
      { authorMasked: "y".repeat(200), content: "z".repeat(2500), rating: 9, keywords: ["a".repeat(100), "b"] },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.authorMasked).toHaveLength(80);
    expect(result[0]?.content).toHaveLength(2000);
    expect(result[0]?.rating).toBeNull();
    expect(result[0]?.keywords).toEqual(["a".repeat(60), "b"]);
  });
});
