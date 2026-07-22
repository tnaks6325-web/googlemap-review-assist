import { describe, expect, it } from "vitest";
import {
  REVIEW_DRAFT_DIVERSITY_VERSION,
  REVIEW_DRAFT_STYLE_SLOTS,
  analyzeDraftDiversity,
  draftEndingStyle,
  draftSimilarity,
  findDraftQualityIssues,
  styleSlotForSequence,
} from "@/lib/domain/review-draft-diversity";

describe("review draft diversity", () => {
  it("defines a complete 5 by 5 matrix with stable slot ids", () => {
    expect(REVIEW_DRAFT_DIVERSITY_VERSION).toBe("review-diversity-v4");
    expect(REVIEW_DRAFT_STYLE_SLOTS).toHaveLength(25);
    expect(new Set(REVIEW_DRAFT_STYLE_SLOTS.map((slot) => slot.id)).size).toBe(25);
    expect(new Set(REVIEW_DRAFT_STYLE_SLOTS.map((slot) => slot.tone)).size).toBe(5);
    expect(new Set(REVIEW_DRAFT_STYLE_SLOTS.map((slot) => slot.structure)).size).toBe(5);
    expect(new Set(REVIEW_DRAFT_STYLE_SLOTS.map((slot) => slot.endingStyle))).toEqual(
      new Set(["FORMAL", "CONVERSATIONAL", "OBSERVATIONAL", "SOFT_COPULA"]),
    );
    expect(
      REVIEW_DRAFT_STYLE_SLOTS.filter((slot) => slot.endingStyle === "FORMAL").length,
    ).toBeLessThanOrEqual(3);
  });

  it("assigns restrained tilde, double-exclamation, and triple-exclamation variants", () => {
    const punctuationStyles = new Set(
      REVIEW_DRAFT_STYLE_SLOTS.map((slot) => slot.punctuationStyle),
    );

    expect(punctuationStyles).toEqual(
      new Set(["STANDARD", "TILDE", "DOUBLE_EXCLAMATION", "TRIPLE_EXCLAMATION"]),
    );
    expect(
      REVIEW_DRAFT_STYLE_SLOTS.some(
        (slot) => slot.punctuationStyle === "TRIPLE_EXCLAMATION" && slot.maxExclamations === 3,
      ),
    ).toBe(true);
  });

  it("classifies formal and conversational Korean endings", () => {
    expect(draftEndingStyle("차분하게 둘러보기 좋은 공간입니다.")).toBe("FORMAL");
    expect(draftEndingStyle("외관이 자연스럽게 눈길을 끕니다.")).toBe("FORMAL");
    expect(draftEndingStyle("필요한 정보를 살펴보기 좋답니다.")).toBe("FORMAL");
    expect(draftEndingStyle("차분한 분위기에서 메뉴를 살펴볼 수 있어요.")).toBe("CONVERSATIONAL");
    expect(draftEndingStyle("차분한 분위기가 자연스럽게 느껴져요.")).toBe("OBSERVATIONAL");
    expect(draftEndingStyle("눈여겨볼 만한 메뉴 구성.")).toBe("NOUN_PHRASE");
    expect(draftEndingStyle("가볍게 둘러보기 좋죠!!!")).toBe("CONVERSATIONAL");
    expect(draftEndingStyle("동선이 자연스럽게 이어진다.")).toBe("CONVERSATIONAL");
    expect(draftEndingStyle("가볍게 살펴보는 건 어떨까?")).toBe("CONVERSATIONAL");
  });

  it("rejects noun-phrase endings instead of storing them as quality-passed drafts", () => {
    const issues = findDraftQualityIssues("눈여겨볼 만한 메뉴 구성.", []);

    expect(issues.some((issue) => issue.code === "DISALLOWED_ENDING_STYLE")).toBe(true);
  });

  it("rejects an overused formal ending style across accepted drafts", () => {
    const existing = [
      "운영 시간이 넉넉하게 안내되어 있습니다.",
      "메뉴 구성이 한눈에 들어오는 곳입니다.",
      "대중교통으로 찾아가기 편리한 편입니다.",
      "차분한 분위기가 돋보이는 공간입니다.",
    ];

    const issues = findDraftQualityIssues("여러 메뉴를 살펴보기 좋은 구성입니다.", existing);

    expect(issues.some((issue) => issue.code === "OVERUSED_ENDING_STYLE")).toBe(true);
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
