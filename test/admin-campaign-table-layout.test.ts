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
  it("uses the wide admin canvas for the PC campaign list", () => {
    expect(campaignPageSource).toContain("wideContent");
    expect(shellSource).toContain('wideContent ? "max-w-[1920px]" : "max-w-[1600px]"');
    expect(shellSource).toContain('wideContent ? "max-w-[1680px]" : "max-w-[1440px]"');
  });

  it("fits the desktop table without horizontal scroll controls", () => {
    expect(componentSource).toContain('className="w-full table-fixed border-separate border-spacing-0"');
    expect(componentSource).not.toContain("min-w-[1730px]");
    expect(componentSource).not.toContain("topTableScrollRef");
    expect(componentSource).not.toContain("bottomTableScrollRef");
    expect(componentSource).not.toContain("syncTableScroll");
  });

  it("uses compact combined columns while keeping details aligned", () => {
    expect(componentSource).toContain("<colgroup>");
    expect(componentSource).toContain('<col className="w-[24%]" />');
    expect(componentSource).toContain('<col className="w-[22%]" />');
    expect(componentSource).toContain("지급 / 코드");
    expect(componentSource).toContain("원고 · 채널 · 참고");
    expect(componentSource).toContain("colSpan={8}");
    expect(componentSource).toContain('<tr className="group h-[92px]">');
  });

  it("keeps the operational status badge on one horizontal line", () => {
    expect(componentSource).toContain(
      "inline-flex max-w-full min-h-6 truncate items-center rounded-full",
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

  it("keeps direct setup and review actions available without widening the table", () => {
    expect(componentSource).toContain("flex flex-wrap items-center justify-end gap-1.5");
    expect(componentSource).toContain('"직접세팅"');
    expect(componentSource).toContain("min-w-24 whitespace-nowrap");
    expect(componentSource).not.toContain('"수동 세팅 적용"');
  });
});
