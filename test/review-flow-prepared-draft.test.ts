import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reviewer prepared draft flow", () => {
  it("moves directly from assignment to a prepared draft without client-side generation", () => {
    const source = readFileSync("components/flow/ReviewFlow.tsx", "utf8");

    expect(source).not.toContain("/api/reviewer/campaigns/draft");
    expect(source).not.toContain("원고 생성하고 복사하기");
    expect(source).not.toContain("원고 다시 생성");
    expect(source).toContain("setDraft(data.draft?.text ?? \"\")");
    expect(source).toContain("setStep(\"draft\")");
    expect(source).toContain("copyReviewDraftToClipboard(draft)");
    expect(source).toContain("리뷰 캡처 이미지 첨부하기");
    expect(source).toContain("PNG, JPG, WEBP");
    expect(source).toContain("border-dashed");
    expect(source).toContain("원고가 클립보드에 자동 복사됐어요.");
  });
});
