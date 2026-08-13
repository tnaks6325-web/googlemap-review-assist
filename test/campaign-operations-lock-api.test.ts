import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const protectedMutationRoutes = [
  "../app/api/admin/campaigns/[campaignId]/route.ts",
  "../app/api/admin/campaigns/[campaignId]/automation/retry/route.ts",
  "../app/api/admin/campaigns/[campaignId]/manual-setup/route.ts",
  "../app/api/admin/campaigns/[campaignId]/blog-references/route.ts",
  "../app/api/admin/campaigns/[campaignId]/draft-evidence/route.ts",
  "../app/api/admin/campaigns/[campaignId]/draft-guidance/route.ts",
  "../app/api/admin/campaigns/[campaignId]/draft-preview/route.ts",
  "../app/api/admin/campaigns/[campaignId]/drafts/quality-excluded/route.ts",
  "../app/api/admin/campaigns/[campaignId]/drafts/[draftId]/route.ts",
  "../app/api/admin/campaigns/[campaignId]/naver-candidates/route.ts",
  "../app/api/admin/campaigns/[campaignId]/naver-place/route.ts",
  "../app/api/admin/sheet-imports/google-map-review/sync/route.ts",
  "../app/api/admin/review-proofs/[assignmentId]/route.ts",
];

describe("campaign operations lock API enforcement", () => {
  it("rejects every campaign-management mutation while automation is active", () => {
    for (const path of protectedMutationRoutes) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source, path).toContain("campaignOperationsMutationLockResponse");
    }
  });
});
