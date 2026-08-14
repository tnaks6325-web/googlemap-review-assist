import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  new URL(
    "../components/admin/AdminCampaignOperationsTable.tsx",
    import.meta.url,
  ),
  "utf8",
);
const shellSource = readFileSync(
  new URL("../components/admin/AdminShell.tsx", import.meta.url),
  "utf8",
);
const campaignPageSource = readFileSync(
  new URL("../app/admin/campaigns/page.tsx", import.meta.url),
  "utf8",
);

describe("admin campaign table layout", () => {
  it("uses the wide admin canvas so the management column stays visible", () => {
    expect(campaignPageSource).toContain("wideContent");
    expect(shellSource).toContain('wideContent ? "max-w-[1920px]" : "max-w-[1600px]"');
    expect(shellSource).toContain('wideContent ? "max-w-[1680px]" : "max-w-[1440px]"');
  });

  it("keeps campaign columns stable when a detail row is expanded", () => {
    expect(componentSource).toContain(
      'className="w-full min-w-[1540px] table-fixed border-separate border-spacing-0"',
    );
    expect(componentSource).toContain("<colgroup>");
    expect(componentSource).toContain('<col className="w-[104px]" />');
    expect(componentSource).toContain('<col className="w-[300px]" />');
    expect(componentSource).toContain('colSpan={11}');
    expect(componentSource).toContain('<tr className="group h-[92px]">');
  });

  it("pins the campaign column and provides synced horizontal scrollbars above and below the list", () => {
    expect(componentSource).toContain("topTableScrollRef");
    expect(componentSource).toContain("bottomTableScrollRef");
    expect(componentSource).toContain("syncTableScroll");
    expect(componentSource).toContain('aria-label="캠페인 목록 가로 스크롤"');
    expect(componentSource).toContain("sticky left-[90px] z-10");
    expect(componentSource).toContain('<TableHeading stickyLeft stickyOffset="left-[90px]">캠페인</TableHeading>');
  });

  it("keeps the operational status badge on one horizontal line", () => {
    expect(componentSource).toContain(
      "inline-flex min-h-6 whitespace-nowrap items-center rounded-full",
    );
  });

  it("shows the campaign period without changing the fixed row height", () => {
    expect(componentSource).toContain("formatCampaignPeriod");
    expect(componentSource).toContain("campaign.startDate");
    expect(componentSource).toContain("campaign.endDate");
    expect(componentSource).toContain('<tr className="group h-[92px]">');
  });

  it("provides a campaign reward editor in the expanded detail", () => {
    expect(componentSource).toContain("AdminCampaignRewardPoints");
    expect(componentSource).toContain("initialRewardPoints={campaign.rewardPoints}");
  });

  it("removes the reviewer-page shortcut from the management buttons", () => {
    expect(componentSource).not.toContain("참여 페이지 열기");
  });

  it("keeps the campaign automation action labeled as one-click setup", () => {
    expect(componentSource).toContain('automationProgress ?? "원클릭 세팅"');
    expect(componentSource).not.toContain('automationProgress ?? "네이버 자동보정 + 참고자료 수집"');
  });

  it("labels direct setup without allowing the action text to wrap", () => {
    expect(componentSource).toContain('"직접세팅"');
    expect(componentSource).toContain("min-w-24 whitespace-nowrap");
    expect(componentSource).not.toContain('"수동 세팅 적용"');
  });
});
