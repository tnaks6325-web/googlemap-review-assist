import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateUniqueSlug } from "@/lib/domain/codes";
import { resetReviewerCampaignCooldownByReviewerId } from "@/lib/domain/reviewer-cooldown-reset";

let sequence = 0;
const unique = () => `${Date.now()}-${sequence++}-${Math.floor(Math.random() * 1_000_000)}`;

async function createReceipt(email: string, createdAt: Date) {
  const reviewer = await prisma.reviewer.create({
    data: { email, wallet: { create: {} } },
  });
  const owner = await prisma.owner.create({
    data: { email: `cooldown-owner-${unique()}@test.local`, password: "x" },
  });
  const business = await prisma.business.create({
    data: {
      ownerId: owner.id,
      name: `cooldown-place-${unique()}`,
      address: "Seoul test address",
      googlePlaceId: `cooldown-google-${unique()}`,
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      businessId: business.id,
      slug: await generateUniqueSlug(),
      name: `cooldown-campaign-${unique()}`,
      active: true,
    },
  });
  const receipt = await prisma.receipt.create({
    data: {
      businessId: business.id,
      campaignId: campaign.id,
      reviewerId: reviewer.id,
      source: "CAMPAIGN_ASSIGNMENT",
      dedupeHash: `cooldown-receipt-${unique()}`,
      status: "COMPLETED",
      createdAt,
    },
  });

  return { reviewer, receipt };
}

describe("reviewer campaign cooldown reset", () => {
  it("moves only the selected reviewer's recent participation records outside the 7-day window", async () => {
    const now = new Date("2026-07-17T00:00:00.000Z");
    const recentAt = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const target = await createReceipt(`target-${unique()}@test.local`, recentAt);
    const other = await createReceipt(`other-${unique()}@test.local`, recentAt);

    const result = await resetReviewerCampaignCooldownByReviewerId(target.reviewer.id, now);

    expect(result).toMatchObject({
      reviewerId: target.reviewer.id,
      resetCount: 1,
      cooldownDays: 7,
    });

    const [resetReceipt, untouchedReceipt] = await Promise.all([
      prisma.receipt.findUniqueOrThrow({ where: { id: target.receipt.id } }),
      prisma.receipt.findUniqueOrThrow({ where: { id: other.receipt.id } }),
    ]);

    expect(resetReceipt.createdAt).toEqual(new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000));
    expect(untouchedReceipt.createdAt).toEqual(recentAt);
  });

  it("returns null when the reviewer id does not exist", async () => {
    await expect(
      resetReviewerCampaignCooldownByReviewerId(`missing-${unique()}`),
    ).resolves.toBeNull();
  });
});
