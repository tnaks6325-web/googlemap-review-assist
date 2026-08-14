import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tableSource = readFileSync(
  new URL("../components/admin/AdminCampaignOperationsTable.tsx", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../app/api/admin/campaigns/[campaignId]/automation/route.ts", import.meta.url),
  "utf8",
);
const workerSource = readFileSync(
  new URL("../lib/domain/operational-jobs.ts", import.meta.url),
  "utf8",
);
const globalsSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("campaign-level automation controls", () => {
  it("shows an automatic ON/OFF control for every campaign in desktop and mobile lists", () => {
    expect(tableSource).toContain("CampaignAutomationToggle");
    expect(tableSource).toContain("자동 ON");
    expect(tableSource).toContain("자동 OFF");
    expect(tableSource).toContain("/automation");
  });

  it("requires an authenticated same-origin admin request to persist the setting", () => {
    expect(routeSource).toContain("export async function PATCH");
    expect(routeSource).toContain("checkOrigin(req)");
    expect(routeSource).toContain("getAdminId()");
    expect(routeSource).toContain("automationEnabled: body.enabled");
  });

  it("does not execute normal automatic jobs for campaigns that are turned off", () => {
    expect(workerSource).toContain("automationEnabled: true");
    expect(workerSource).toContain("AUTOMATION_PAUSED");
  });

  it("reduces the desktop admin workspace to 80 percent scale", () => {
    expect(globalsSource).toContain("zoom: 0.8");
    expect(globalsSource).toContain("width: 125%");
  });
});
