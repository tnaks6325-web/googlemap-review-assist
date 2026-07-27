import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(
  new URL("../components/campaign/ReviewerDashboardPanels.tsx", import.meta.url),
  "utf8",
);
const resubmissionSource = readFileSync(
  new URL("../components/campaign/RejectedReviewResubmission.tsx", import.meta.url),
  "utf8",
);

describe("reviewer rejection resubmission UI", () => {
  it("shows the rejection reason and a resubmission action for rejected participation", () => {
    expect(dashboardSource).toContain("RejectedReviewResubmission");
    expect(resubmissionSource).toContain("반려 사유");
    expect(resubmissionSource).toContain("기존 제출 파일");
    expect(resubmissionSource).toContain("수정한 리뷰 캡처");
    expect(resubmissionSource).toContain("보완 제출하기");
  });

  it("submits the replacement image and optional resubmission note through the protected endpoint", () => {
    expect(resubmissionSource).toContain('/api/reviewer/campaigns/complete');
    expect(resubmissionSource).toContain('form.append("assignmentId"');
    expect(resubmissionSource).toContain('form.append("screenshot"');
    expect(resubmissionSource).toContain('form.append("resubmissionNote"');
  });
});
