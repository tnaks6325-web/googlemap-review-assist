import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellSource = readFileSync(
  new URL("../components/admin/AdminShell.tsx", import.meta.url),
  "utf8",
);
const globalsSource = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const automationSource = readFileSync(
  new URL("../components/admin/AdminCampaignAutomationStatus.tsx", import.meta.url),
  "utf8",
);
const campaignSource = readFileSync(
  new URL("../components/admin/AdminCampaignOperationsTable.tsx", import.meta.url),
  "utf8",
);

describe("admin mobile workspace presentation", () => {
  it("uses a compact mobile header and an expandable section menu", () => {
    expect(shellSource).toContain("admin-mobile-only");
    expect(shellSource).toContain("현재 메뉴");
    expect(shellSource).toContain("<details");
  });

  it("lets mobile presentation apply both to real phones and the desktop mobile-mode preview", () => {
    expect(globalsSource).toContain(".admin-mobile-only");
    expect(globalsSource).toContain('[data-admin-display-mode="mobile"] .admin-mobile-only');
    expect(globalsSource).toContain(".admin-desktop-only");
  });

  it("replaces dense administration tables with mobile cards while keeping the desktop tables", () => {
    expect(automationSource).toContain("admin-mobile-only");
    expect(automationSource).toContain("admin-desktop-only");
    expect(automationSource).toContain("MobileAutomationStatusCard");
    expect(campaignSource).toContain("admin-mobile-only");
    expect(campaignSource).toContain("admin-desktop-only");
    expect(campaignSource).toContain("MobileCampaignCard");
  });
});
