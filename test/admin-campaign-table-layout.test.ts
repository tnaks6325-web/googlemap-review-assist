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
      'className="w-full min-w-[1260px] table-fixed border-separate border-spacing-0"',
    );
    expect(componentSource).toContain("<colgroup>");
    expect(componentSource).toContain('<col className="w-[104px]" />');
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
});
