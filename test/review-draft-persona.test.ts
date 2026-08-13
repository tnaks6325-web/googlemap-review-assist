import { describe, expect, it } from "vitest";

import {
  ReviewDraftPersonaError,
  normalizeReviewDraftPersonaInput,
  personaForDraftSequence,
  reviewDraftPersonaExamplesForPrompt,
} from "@/lib/domain/review-draft-personas";

describe("review draft persona input", () => {
  it("retains only safe HTTPS reference URLs", () => {
    const persona = normalizeReviewDraftPersonaInput({
      name: "쩝쩝박사",
      styleInstruction: "짧고 생생하게 장점을 설명합니다.",
      examples: ["고기는 부드럽고 반찬 구성이 알찼어요."],
      referenceUrls: ["https://www.google.com/maps/contrib/117517074326565153572", "https://www.google.com/maps/contrib/117517074326565153572"],
    });

    expect(persona.referenceUrls).toEqual(["https://www.google.com/maps/contrib/117517074326565153572"]);
  });

  it("rejects unsafe reference URLs rather than fetching them", () => {
    expect(() => normalizeReviewDraftPersonaInput({
      name: "쩝쩝박사",
      styleInstruction: "음식의 장점을 차분하게 설명합니다.",
      examples: [],
      referenceUrls: ["http://127.0.0.1:3000/private"],
    })).toThrow(ReviewDraftPersonaError);
  });

  it("selects active personas deterministically and bounds prompt examples", () => {
    expect(personaForDraftSequence([{ id: "a" }, { id: "b" }], 3)?.id).toBe("b");
    expect(reviewDraftPersonaExamplesForPrompt(Array.from({ length: 25 }, (_, index) => `학습 리뷰 ${index}`))).toHaveLength(20);
  });
});
