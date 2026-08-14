import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adjacentReviewProofId,
  reviewProofDecisionBody,
  reviewProofReviewerLabel,
} from "@/lib/review-proof-queue";

const queueSource = readFileSync(
  new URL("../components/admin/ReviewProofQueue.tsx", import.meta.url),
  "utf8",
);

describe("review proof queue navigation", () => {
  it("moves to the adjacent pending proof and stops at each end", () => {
    expect(adjacentReviewProofId(["proof-1", "proof-2", "proof-3"], "proof-2", "next")).toBe("proof-3");
    expect(adjacentReviewProofId(["proof-1", "proof-2", "proof-3"], "proof-1", "previous")).toBeNull();
  });
  it("shows the reviewer name with the masked phone, falling back to the phone", () => {
    expect(reviewProofReviewerLabel("김리뷰", "010****12")).toBe("김리뷰 · 010****12");
    expect(reviewProofReviewerLabel(null, "010****12")).toBe("010****12");
  });

  it("sends rejections in the API's custom-reason format", () => {
    expect(reviewProofDecisionBody("reject", "이미지를 다시 제출해 주세요.")).toEqual({
      action: "reject",
      reasonCode: "CUSTOM",
      customReason: "이미지를 다시 제출해 주세요.",
    });
    expect(reviewProofDecisionBody("approve", "관리자 확인 완료")).toEqual({
      action: "approve",
      note: "관리자 확인 완료",
    });
  });

  it("opens the inspection modal when a proof thumbnail is clicked", () => {
    expect(queueSource).toContain("onClick={() => openModal(item.id)}");
    expect(queueSource).not.toContain('target={item.hasProofImage ? "_blank" : undefined}');
  });

  it("derives the visible queue from incoming items without synchronously copying props into state", () => {
    expect(queueSource).not.toContain("useEffect(() => setQueue(items), [items])");
    expect(queueSource).toContain("dismissedIds");
  });
});
