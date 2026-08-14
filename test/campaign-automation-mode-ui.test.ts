import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("../app/admin/campaigns/page.tsx", import.meta.url), "utf8");
const toggleSource = readFileSync(new URL("../components/admin/CampaignAutomationModeToggle.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../app/api/admin/campaign-automation/route.ts", import.meta.url), "utf8");
const dailyRouteSource = readFileSync(new URL("../app/api/internal/campaign-automation/daily/route.ts", import.meta.url), "utf8");

describe("campaign automation mode control", () => {
  it("shows a persisted automatic/manual toggle in the campaign admin page", () => {
    expect(pageSource).toContain("CampaignAutomationModeToggle");
    expect(pageSource).toContain("getCampaignAutomationControl");
    expect(toggleSource).toContain("자동 ON");
    expect(toggleSource).toContain("수동 OFF");
  });

  it("requires an authenticated, same-origin admin request to change the mode", () => {
    expect(routeSource).toContain("export async function PATCH");
    expect(routeSource).toContain("checkOrigin(req)");
    expect(routeSource).toContain("getAdminId()");
    expect(routeSource).toContain("setCampaignAutomationEnabled");
  });

  it("uses the persisted mode before scheduling daily automation", () => {
    expect(dailyRouteSource).toContain("isCampaignAutomationEnabled");
  });
});
