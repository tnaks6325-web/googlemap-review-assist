import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  new URL(
    "../components/admin/AdminCampaignOperationsTable.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("admin campaign table layout", () => {
  it("keeps campaign columns stable when a detail row is expanded", () => {
    expect(componentSource).toContain(
      'className="w-full min-w-[1420px] table-fixed border-separate border-spacing-0"',
    );
    expect(componentSource).toContain("<colgroup>");
    expect(componentSource).toContain('<col className="w-[104px]" />');
    expect(componentSource).toContain('<col className="w-[400px]" />');
    expect(componentSource).toContain('<tr className="group h-[92px]">');
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
});
