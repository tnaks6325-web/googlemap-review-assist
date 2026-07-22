import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productionSchema = readFileSync("prisma/schema.postgres.prisma", "utf8");

describe("production schema data preservation", () => {
  it.each([
    "CampaignPreparedDraftBatch",
    "CampaignPreparedDraft",
    "CampaignReviewDraft",
  ])("keeps the populated legacy %s table mapped", (modelName) => {
    expect(productionSchema).toContain(`model ${modelName} {`);
  });

  it("keeps legacy draft relations reachable without changing table names", () => {
    expect(productionSchema).toContain("preparedDraftBatches CampaignPreparedDraftBatch[]");
    expect(productionSchema).toContain("preparedDrafts       CampaignPreparedDraft[]");
    expect(productionSchema).toContain("reviewDrafts         CampaignReviewDraft[]");
    expect(productionSchema).toContain("assignedPreparedDrafts CampaignPreparedDraft[]");
    expect(productionSchema).toContain("campaignReviewDraft    CampaignReviewDraft?");
  });
});
