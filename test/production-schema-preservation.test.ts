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
    expect(productionSchema).toMatch(/preparedDraftBatches\s+CampaignPreparedDraftBatch\[\]/u);
    expect(productionSchema).toMatch(/preparedDrafts\s+CampaignPreparedDraft\[\]/u);
    expect(productionSchema).toMatch(/reviewDrafts\s+CampaignReviewDraft\[\]/u);
    expect(productionSchema).toMatch(/assignedPreparedDrafts\s+CampaignPreparedDraft\[\]/u);
    expect(productionSchema).toMatch(/campaignReviewDraft\s+CampaignReviewDraft\?/u);
  });
});
