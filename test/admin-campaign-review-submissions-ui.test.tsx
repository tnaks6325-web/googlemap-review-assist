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
const rejectionSource = readFileSync(
  new URL("../lib/review-rejection.ts", import.meta.url),
  "utf8",
);
const reanalysisRouteSource = readFileSync(
  new URL(
    "../app/api/admin/campaigns/[campaignId]/review-submissions/reanalyze/route.ts",
    import.meta.url,
  ),
  "utf8",
);

describe("admin campaign review submissions UI", () => {
  it("adds a clickable passed-over-submitted review inspection column and accessible modal", () => {
    expect(tableSource).toContain("AdminCampaignReviewSubmissions");
    expect(tableSource).toContain("리뷰검수");
    expect(tableSource).toContain("initialPassedCount={campaign.passedReviewCount}");
    expect(modalSource).toContain("{displayPassedCount}/{displayCount}");
    expect(modalSource).not.toContain("리뷰제출함 {displayCount}건");
    expect(modalSource).toContain("리뷰 제출함");
    expect(modalSource).toContain('role="dialog"');
    expect(modalSource).toContain('aria-modal="true"');
  });

  it("supports thumbnail and table modes plus enlarged proof images", () => {
    expect(modalSource).toContain("썸네일");
    expect(modalSource).toContain("테이블");
    expect(modalSource).toContain("이미지 확대 보기");
    expect(modalSource).toContain('useState<ViewMode>("TABLE")');
    expect(modalSource).toContain('setView("TABLE")');
    expect(modalSource).toContain('["TABLE", "THUMBNAIL"]');
  });

  it("replaces machine-readable AI reasons with Korean descriptions", () => {
    expect(modalSource).toContain('DRAFT_TEXT_MATCHED: "원고 내용 일치"');
    expect(modalSource).toContain('PLACE_NAME_NOT_FOUND: "매장명 확인 불가"');
    expect(modalSource).toContain("const reasonLabel = analysisReasonLabel(item.analysisReason)");
    expect(modalSource).not.toContain('` · ${item.analysisReason}`');
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

  it("requires an explicit rejection reason before confirming rejection", () => {
    expect(modalSource).toContain("반려 사유 선택");
    expect(rejectionSource).toContain("타매장 리뷰가 제출되었음");
    expect(rejectionSource).toContain("리뷰내용 수정필요");
    expect(rejectionSource).toContain("직접입력");
    expect(modalSource).toContain("상세 반려 사유");
    expect(modalSource).toContain("reasonCode");
    expect(modalSource).toContain("customReason");
  });

  it("offers an authenticated bulk AI reanalysis action for pending submissions", () => {
    expect(modalSource).toContain("AI 일괄 재검수");
    expect(modalSource).toContain("autoApproved");
    expect(modalSource).toContain("stillPending");
    expect(reanalysisRouteSource).toContain("checkOrigin(req)");
    expect(reanalysisRouteSource).toContain("getAdminId()");
    expect(reanalysisRouteSource).toContain("reanalyzeAdminCampaignReviewSubmissions");
  });
});
