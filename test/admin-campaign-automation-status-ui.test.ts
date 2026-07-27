import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  new URL("../components/admin/AdminCampaignAutomationStatus.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../app/admin/campaigns/page.tsx", import.meta.url),
  "utf8",
);

describe("관리자 캠페인 자동화 상태 UI", () => {
  it("단계, 실패 원인, 재시도 동작을 운영자에게 제공한다", () => {
    expect(componentSource).toContain("자동화 상태");
    expect(componentSource).toContain("실패 사유");
    expect(componentSource).toContain("재시도");
    expect(componentSource).toContain("/automation/retry");
  });

  it("관리자 캠페인 화면이 최신 자동화 상태를 함께 조회한다", () => {
    expect(pageSource).toContain("listAdminCampaignAutomationStatuses");
    expect(pageSource).toContain("AdminCampaignAutomationStatus");
  });
});
