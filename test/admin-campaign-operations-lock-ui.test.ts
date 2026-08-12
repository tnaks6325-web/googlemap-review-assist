import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("../app/admin/campaigns/page.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../components/admin/AdminCampaignOperationsTable.tsx", import.meta.url), "utf8");
const draftSource = readFileSync(new URL("../components/admin/AdminCampaignDraftPreview.tsx", import.meta.url), "utf8");
const submissionSource = readFileSync(new URL("../components/admin/AdminCampaignReviewSubmissions.tsx", import.meta.url), "utf8");

describe("admin campaign operations automation lock UI", () => {
  it("shows an automation progress banner and passes the lock state to campaign operations", () => {
    expect(pageSource).toContain("getCampaignOperationsAutomationLock");
    expect(pageSource).toContain("AdminCampaignOperationsLockStatus");
  expect(pageSource).toContain("automationLocked={automationLock.isLocked}");
  expect(pageSource).toContain("readOnly={automationLock.isLocked}");
  });

  it("keeps only draft archive, review submissions, and detail expansion available during a lock", () => {
    expect(tableSource).toContain("automationLocked");
    expect(tableSource).toContain("disabled={automationLocked");
    expect(tableSource).toContain("readOnly={automationLocked}");
    expect(draftSource).toContain("readOnly = false");
    expect(submissionSource).toContain("readOnly = false");
  });
});
