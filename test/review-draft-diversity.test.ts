import { describe, expect, it } from "vitest";
import {
  REVIEW_DRAFT_DIVERSITY_VERSION,
  REVIEW_DRAFT_STYLE_SLOTS,
  analyzeDraftDiversity,
  draftSimilarity,
  findDraftQualityIssues,
  styleSlotForSequence,
} from "@/lib/domain/review-draft-diversity";

describe("review draft diversity", () => {
  it("defines a complete 5 by 5 matrix with stable slot ids", () => {
    expect(REVIEW_DRAFT_DIVERSITY_VERSION).toBe("review-diversity-v2");
    expect(REVIEW_DRAFT_STYLE_SLOTS).toHaveLength(25);
    expect(new Set(REVIEW_DRAFT_STYLE_SLOTS.map((slot) => slot.id)).size).toBe(25);
    expect(new Set(REVIEW_DRAFT_STYLE_SLOTS.map((slot) => slot.tone)).size).toBe(5);
    expect(new Set(REVIEW_DRAFT_STYLE_SLOTS.map((slot) => slot.structure)).size).toBe(5);
  });

  it("cycles through every slot once before starting a new cycle", () => {
    const firstCycle = Array.from({ length: 25 }, (_, sequence) => styleSlotForSequence(sequence).id);
    expect(new Set(firstCycle).size).toBe(25);
    expect(styleSlotForSequence(25).id).toBe(styleSlotForSequence(0).id);
  });

  it("normalizes spacing and punctuation when comparing Korean drafts", () => {
    const left = "공간이 넓고, 좌석 간격도 여유로워요.";
    const right = "공간이  넓고 좌석 간격도 여유로워요!";
    expect(draftSimilarity(left, right)).toBeGreaterThan(0.9);
  });

  it("rejects highly similar drafts and repeated openings", () => {
    const existing = ["공간이 넓고 좌석 간격도 여유로워 편하게 둘러보기 좋아요."];
    const issues = findDraftQualityIssues(
      "공간이 넓고 좌석 간격도 여유로워 천천히 둘러보기 좋아요.",
      existing,
    );

    expect(issues.some((issue) => issue.code === "HIGH_SIMILARITY")).toBe(true);
    expect(issues.some((issue) => issue.code === "REPEATED_OPENING")).toBe(true);
  });

  it("reports pairwise metrics for a campaign preview", () => {
    const metrics = analyzeDraftDiversity([
      "정돈된 공간 구성이 눈에 들어와요.",
      "운영 시간이 안내되어 있어 방문 계획을 세우기 편해 보여요.",
      "대중교통으로 접근할 수 있는 위치 정보가 잘 정리되어 있습니다.",
    ]);

    expect(metrics.pairCount).toBe(3);
    expect(metrics.maxSimilarity).toBeGreaterThanOrEqual(metrics.averageSimilarity);
    expect(metrics.duplicateCount).toBe(0);
  });
});
