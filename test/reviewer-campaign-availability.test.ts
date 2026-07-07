import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateUniqueSlug } from "@/lib/domain/codes";
import { DEFAULT_REWARD_POINTS } from "@/lib/domain/operator-campaigns";
import {
  submitReviewerCampaignProof,
  assignReviewerCampaign,
  completeReviewerCampaignAssignment,
  getReviewerCampaignAvailability,
} from "@/lib/domain/reviewer-campaigns";

let seq = 0;
const uniq = () => `${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e6)}`;

async function createReviewer() {
  return prisma.reviewer.create({
    data: { phone: `0108${String(seq++).padStart(7, "0")}`, wallet: { create: {} } },
  });
}

async function createCampaign(googlePlaceId: string, category?: string | null) {
  const owner = await prisma.owner.create({ data: { email: `reviewer-${uniq()}@test.local`, password: "x" } });
  const business = await prisma.business.create({
    data: {
      ownerId: owner.id,
      name: `place-${uniq()}`,
      address: "서울시 테스트로 1",
      googlePlaceId,
      externalPlaces:
        category === undefined
          ? undefined
          : {
              create: {
                platform: "GOOGLE",
                externalId: googlePlaceId,
                name: `place-${uniq()}`,
                address: "서울시 테스트로 1",
                category,
                url: `https://maps.example/${googlePlaceId}`,
              },
            },
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      businessId: business.id,
      slug: await generateUniqueSlug(),
      name: `campaign-${uniq()}`,
      active: true,
    },
  });
  return { business, campaign };
}

describe("reviewer campaign availability", () => {
  it("excludes the same Google place for 7 days and sums eligible rewards", async () => {
    const reviewer = await createReviewer();
    const blocked = await createCampaign(`google-place-blocked-${uniq()}`);
    const eligible = await createCampaign(`google-place-eligible-${uniq()}`);

    await prisma.receipt.create({
      data: {
        businessId: blocked.business.id,
        campaignId: blocked.campaign.id,
        reviewerId: reviewer.id,
        code: `RECENT-${uniq()}`,
        source: "CAMPAIGN_ASSIGNMENT",
        dedupeHash: `recent:${uniq()}`,
        status: "VERIFIED",
        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      },
    });

    const availability = await getReviewerCampaignAvailability(reviewer.id);
    const ids = availability.campaigns.map((campaign) => campaign.id);

    expect(ids).not.toContain(blocked.campaign.id);
    expect(ids).toContain(eligible.campaign.id);
    expect(availability.totalRewardPoints).toBe(
      availability.campaigns.length * DEFAULT_REWARD_POINTS,
    );
  });

  it("assignment creates a participation record so the assigned campaign is no longer immediately eligible", async () => {
    const reviewer = await createReviewer();
    await createCampaign(`google-place-assignment-${uniq()}`);

    const result = await assignReviewerCampaign(reviewer.id);

    expect(result.assignedCampaign).toBeTruthy();
    expect(result.assignmentId).toBeTruthy();

    const receipt = await prisma.receipt.findUnique({ where: { id: result.assignmentId! } });
    expect(receipt).toMatchObject({ reviewerId: reviewer.id, source: "CAMPAIGN_ASSIGNMENT", status: "ASSIGNED" });

    const nextAvailability = await getReviewerCampaignAvailability(reviewer.id);
    expect(nextAvailability.campaigns.map((campaign) => campaign.id)).not.toContain(result.assignedCampaign!.id);
  });

  it("screenshot proof waits for admin approval and credits reward points once", async () => {
    const reviewer = await createReviewer();
    await createCampaign(`google-place-complete-${uniq()}`);
    const assigned = await assignReviewerCampaign(reviewer.id);

    const submitted = await submitReviewerCampaignProof(reviewer.id, assigned.assignmentId!, {
      screenshotUrl: "/uploads/review-proofs/test.png",
      screenshotMimeType: "image/png",
      screenshotOriginalName: "test.png",
      draftText: "테스트 매장에 방문했고 만족스러운 시간을 보냈습니다.",
    });

    expect(submitted).toMatchObject({
      assignmentId: assigned.assignmentId,
      status: "REVIEW_SUBMITTED",
      earned: 0,
      pendingApproval: true,
    });
    let receipt = await prisma.receipt.findUnique({ where: { id: assigned.assignmentId! } });
    expect(receipt).toMatchObject({
      status: "REVIEW_SUBMITTED",
      reviewProofImageUrl: "/uploads/review-proofs/test.png",
    });
    expect((await prisma.pointTransaction.findMany({
      where: { idempotencyKey: `campaign-complete:${assigned.assignmentId}` },
    }))).toHaveLength(0);

    const first = await completeReviewerCampaignAssignment(assigned.assignmentId!, "admin:test");
    const second = await completeReviewerCampaignAssignment(assigned.assignmentId!, "admin:test");

    expect(first).toMatchObject({
      assignmentId: assigned.assignmentId,
      status: "COMPLETED",
      earned: DEFAULT_REWARD_POINTS,
      alreadyCompleted: false,
    });
    expect(second).toMatchObject({
      assignmentId: assigned.assignmentId,
      status: "COMPLETED",
      earned: 0,
      alreadyCompleted: true,
    });

    receipt = await prisma.receipt.findUnique({ where: { id: assigned.assignmentId! } });
    expect(receipt?.status).toBe("COMPLETED");

    const earnTxs = await prisma.pointTransaction.findMany({
      where: { idempotencyKey: `campaign-complete:${assigned.assignmentId}` },
    });
    expect(earnTxs).toHaveLength(1);
    expect(earnTxs[0]).toMatchObject({ reviewerId: reviewer.id, type: "EARN", amount: DEFAULT_REWARD_POINTS });

    const wallet = await prisma.pointWallet.findUnique({ where: { reviewerId: reviewer.id } });
    expect(wallet?.balance).toBe(DEFAULT_REWARD_POINTS);
  });

  it("auto-approves screenshot proof when AI analysis matches the generated draft", async () => {
    const reviewer = await createReviewer();
    await createCampaign(`google-place-auto-approve-${uniq()}`);
    const assigned = await assignReviewerCampaign(reviewer.id);
    const draftText = "테스트 매장에 방문했고 만족스러운 시간을 보냈습니다.";

    const submitted = await submitReviewerCampaignProof(reviewer.id, assigned.assignmentId!, {
      screenshotUrl: "/uploads/review-proofs/auto.png",
      screenshotMimeType: "image/png",
      screenshotOriginalName: "auto.png",
      draftText,
      analysis: {
        status: "AUTO_APPROVE",
        provider: "test-ai",
        extractedText: `Google 리뷰 게시 완료 ${draftText}`,
        similarity: 0.94,
        reason: "DRAFT_TEXT_MATCHED",
        confidence: 0.9,
      },
    });

    expect(submitted).toMatchObject({
      assignmentId: assigned.assignmentId,
      status: "COMPLETED",
      earned: DEFAULT_REWARD_POINTS,
      alreadyCompleted: false,
      analysis: { status: "AUTO_APPROVE", similarity: 0.94 },
    });

    const receipt = await prisma.receipt.findUnique({ where: { id: assigned.assignmentId! } });
    expect(receipt).toMatchObject({
      status: "COMPLETED",
      reviewProofAnalysisStatus: "AUTO_APPROVE",
      reviewProofAnalysisProvider: "test-ai",
      reviewProofSimilarity: 0.94,
    });

    const wallet = await prisma.pointWallet.findUnique({ where: { reviewerId: reviewer.id } });
    expect(wallet?.balance).toBe(DEFAULT_REWARD_POINTS);
  });

  it("groups eligible campaigns by Google place category", async () => {
    const reviewer = await createReviewer();
    await createCampaign(`google-place-food-a-${uniq()}`, "음식점");
    await createCampaign(`google-place-food-b-${uniq()}`, "음식점>한식");
    await createCampaign(`google-place-cafe-${uniq()}`, "카페");
    await createCampaign(`google-place-unknown-${uniq()}`, null);

    const availability = await getReviewerCampaignAvailability(reviewer.id);

    expect(availability.categoryCounts).toEqual(
      expect.arrayContaining([
        { category: "음식점", count: 2 },
        { category: "카페", count: 1 },
      ]),
    );
    expect(availability.categoryCounts.find((item) => item.category === "기타")?.count).toBeGreaterThanOrEqual(1);
  });
});
