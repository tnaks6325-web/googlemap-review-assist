import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync(
  new URL("../components/admin/AdminCampaignReviewSubmissions.tsx", import.meta.url),
  "utf8",
);
const tableSource = readFileSync(
  new URL("../components/admin/AdminCampaignOperationsTable.tsx", import.meta.url),
  "utf8",
);

describe("admin campaign review submissions UI", () => {
  it("adds a per-campaign review submission button and accessible modal", () => {
    expect(tableSource).toContain("AdminCampaignReviewSubmissions");
    expect(modalSource).toContain("리뷰제출함");
    expect(modalSource).toContain('role="dialog"');
    expect(modalSource).toContain('aria-modal="true"');
  });

  it("supports thumbnail and table modes plus enlarged proof images", () => {
    expect(modalSource).toContain("썸네일");
    expect(modalSource).toContain("테이블");
    expect(modalSource).toContain("이미지 확대 보기");
  });

  it("lets admins browse enlarged proofs with arrow keys and see the reviewer metadata", () => {
    expect(modalSource).toContain('event.key === "ArrowLeft"');
    expect(modalSource).toContain('event.key === "ArrowRight"');
    expect(modalSource).toContain("제출 리뷰어");
    expect(modalSource).toContain("AI 유사도");
  });

  it("shows inspection states and manual decisions for non-passed files", () => {
    expect(modalSource).toContain("검수 통과");
    expect(modalSource).toContain("확인 필요");
    expect(modalSource).toContain("검수 미통과");
    expect(modalSource).toContain("수동 승인");
    expect(modalSource).toContain("반려 확정");
  });

  it("shows place-name inspection as a green match or red manual-review requirement", () => {
    expect(modalSource).toContain("매장명 검수");
    expect(modalSource).toContain("일치");
    expect(modalSource).toContain("확인불가");
    expect(modalSource).toContain("수동검수 필수");
  });
});
