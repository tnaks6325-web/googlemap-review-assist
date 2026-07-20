import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateUniqueSlug } from "@/lib/domain/codes";
import { DEFAULT_REWARD_POINTS } from "@/lib/domain/operator-campaigns";
import {
  submitReviewerCampaignProof,
  assignReviewerCampaign,
  completeReviewerCampaignAssignment,
  getReviewerCampaignAvailability,
  getReviewerCampaignPlaceReveal,
  toConcealedReviewerAssignment,
} from "@/lib/domain/reviewer-campaigns";

let seq = 0;
const uniq = () => `${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e6)}`;

async function createReviewer() {
  return prisma.reviewer.create({
    data: { phone: `0108${String(seq++).padStart(7, "0")}`, wallet: { create: {} } },
  });
}

interface CampaignFixtureOptions {
  category?: string | null;
  sourceReady?: boolean;
  totalQuota?: number;
  dailyQuota?: number;
  startDate?: string;
  endDate?: string;
  rewardPoints?: number;
}

async function createCampaign(
  googlePlaceId: string,
  {
    category = "음식점",
    sourceReady = true,
    totalQuota = 25,
    dailyQuota = 5,
    startDate = "2020-01-01",
    endDate = "2099-12-31",
    rewardPoints = DEFAULT_REWARD_POINTS,
  }: CampaignFixtureOptions = {},
) {
  const owner = await prisma.owner.create({ data: { email: `reviewer-${uniq()}@test.local`, password: "x" } });
  const business = await prisma.business.create({
    data: {
      ownerId: owner.id,
      name: `place-${uniq()}`,
      address: "서울시 테스트로 1",
      googlePlaceId,
      externalPlaces: {
        create: [
          {
            platform: "GOOGLE",
            externalId: googlePlaceId,
            name: `place-${uniq()}`,
            address: "서울시 테스트로 1",
            category,
            url: `https://maps.example/${googlePlaceId}`,
          },
          ...(sourceReady
            ? [
                {
                  platform: "NAVER",
                  externalId: `naver-${googlePlaceId}`,
                  name: `place-${uniq()}`,
                  address: "서울시 테스트로 1",
                  category,
                  url: `https://map.naver.example/${googlePlaceId}`,
                },
              ]
            : []),
        ],
      },
      externalReviews: sourceReady
        ? {
            create: {
              platform: "GOOGLE",
              reviewType: "GENERAL",
              content: "방문하기 편했고 안내가 친절해서 전반적으로 만족스러웠습니다.",
              reviewHash: `reference-${uniq()}`,
            },
          }
        : undefined,
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      businessId: business.id,
      slug: await generateUniqueSlug(),
      name: `campaign-${uniq()}`,
      active: true,
      totalQuota,
      dailyQuota,
      startDate,
      endDate,
      rewardPoints,
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

  it("excludes active campaigns without the two required draft source groups", async () => {
    const reviewer = await createReviewer();
    await prisma.campaign.updateMany({ data: { active: false } });
    const incomplete = await createCampaign(`google-place-incomplete-${uniq()}`, { sourceReady: false });
    const ready = await createCampaign(`google-place-ready-${uniq()}`);

    const availability = await getReviewerCampaignAvailability(reviewer.id);
    const ids = availability.campaigns.map((campaign) => campaign.id);

    expect(ids).not.toContain(incomplete.campaign.id);
    expect(ids).toContain(ready.campaign.id);
    expect(availability.availableCount).toBe(1);
  });

  it("does not treat blank external reviews as usable draft context", async () => {
    const reviewer = await createReviewer();
    await prisma.campaign.updateMany({ data: { active: false } });
    const incomplete = await createCampaign(`google-place-blank-review-${uniq()}`, { sourceReady: false });
    await prisma.externalReview.create({
      data: {
        businessId: incomplete.business.id,
        platform: "GOOGLE",
        content: "<br>   ",
        reviewHash: `blank-reference:${uniq()}`,
      },
    });

    const availability = await getReviewerCampaignAvailability(reviewer.id);

    expect(availability.campaigns.map((campaign) => campaign.id)).not.toContain(incomplete.campaign.id);
  });

  it("assignment creates a participation record so the assigned campaign is no longer immediately eligible", async () => {
    const reviewer = await createReviewer();
    await createCampaign(`google-place-assignment-${uniq()}`);

    const result = await assignReviewerCampaign(reviewer.id);

    expect(result.assignedCampaign).toBeTruthy();
    expect(result.assignmentId).toBeTruthy();

    const receipt = await prisma.receipt.findUnique({ where: { id: result.assignmentId! } });
    expect(receipt).toMatchObject({ reviewerId: reviewer.id, source: "CAMPAIGN_ASSIGNMENT", status: "ASSIGNED" });
    expect(receipt?.assignmentExpiresAt?.getTime()).toBeGreaterThan(receipt!.createdAt.getTime());

    const nextAvailability = await getReviewerCampaignAvailability(reviewer.id);
    expect(nextAvailability.campaigns.map((campaign) => campaign.id)).not.toContain(result.assignedCampaign!.id);
  });

  it("conceals every place field in assignment responses", async () => {
    const reviewer = await createReviewer();
    await prisma.campaign.updateMany({ data: { active: false } });
    const fixture = await createCampaign(`google-place-concealed-${uniq()}`, {
      rewardPoints: 700,
    });

    const result = await assignReviewerCampaign(reviewer.id);
    const concealed = toConcealedReviewerAssignment(result.assignedCampaign!);
    const serialized = JSON.stringify(concealed);

    expect(concealed).toEqual({ rewardPoints: 700 });
    expect(serialized).not.toContain(fixture.business.name);
    expect(serialized).not.toContain(fixture.business.address ?? "");
    expect(serialized).not.toContain("google-place-concealed");
    expect(serialized).not.toContain("maps.example");
  });

  it("reveals place information only after a draft exists and only to its assigned reviewer", async () => {
    const reviewer = await createReviewer();
    const otherReviewer = await createReviewer();
    await prisma.campaign.updateMany({ data: { active: false } });
    const fixture = await createCampaign(`google-place-reveal-${uniq()}`);
    const result = await assignReviewerCampaign(reviewer.id);

    await expect(
      getReviewerCampaignPlaceReveal(reviewer.id, result.assignmentId!),
    ).rejects.toMatchObject({ code: "REVIEW_DRAFT_REQUIRED", status: 409 });

    await prisma.receipt.update({
      where: { id: result.assignmentId! },
      data: {
        reviewDraftText: "복사할 리뷰 원고가 준비되어 있습니다.",
        reviewDraftVersion: 1,
      },
    });

    await expect(
      getReviewerCampaignPlaceReveal(otherReviewer.id, result.assignmentId!),
    ).rejects.toMatchObject({ code: "ASSIGNMENT_NOT_FOUND", status: 404 });

    await expect(
      getReviewerCampaignPlaceReveal(reviewer.id, result.assignmentId!),
    ).resolves.toMatchObject({
      businessName: expect.stringContaining("place-"),
      address: fixture.business.address,
      googleMapsUrl: expect.stringContaining("maps.example"),
    });
  });

  it("snapshots the configured campaign reward and pays that amount after later edits", async () => {
    const reviewer = await createReviewer();
    await prisma.campaign.updateMany({ data: { active: false } });
    const fixture = await createCampaign(`google-place-custom-reward-${uniq()}`, {
      rewardPoints: 750,
    });

    const assigned = await assignReviewerCampaign(reviewer.id);
    expect(assigned.assignedCampaign?.rewardPoints).toBe(750);
    expect(
      await prisma.receipt.findUnique({
        where: { id: assigned.assignmentId! },
        select: { rewardPoints: true },
      }),
    ).toMatchObject({ rewardPoints: 750 });

    await prisma.campaign.update({
      where: { id: fixture.campaign.id },
      data: { rewardPoints: 900 },
    });
    await prisma.receipt.update({
      where: { id: assigned.assignmentId! },
      data: {
        status: "REVIEW_SUBMITTED",
        reviewProofImageUrl: "/uploads/review-proofs/custom-reward.png",
        reviewProofSubmittedAt: new Date(),
      },
    });

    const completed = await completeReviewerCampaignAssignment(
      assigned.assignmentId!,
      "admin:test",
    );

    expect(completed).toMatchObject({ earned: 750, paidAmount: 750 });
    expect(
      await prisma.pointTransaction.findUnique({
        where: { idempotencyKey: `campaign-complete:${assigned.assignmentId}` },
      }),
    ).toMatchObject({ amount: 750 });
    expect(
      await prisma.pointWallet.findUnique({ where: { reviewerId: reviewer.id } }),
    ).toMatchObject({ balance: 750 });
  });

  it("reuses an unexpired active assignment instead of reserving another slot", async () => {
    const reviewer = await createReviewer();
    await prisma.campaign.updateMany({ data: { active: false } });
    await createCampaign(`google-place-reuse-${uniq()}`);
    const now = new Date("2026-07-21T00:00:00.000Z");

    const first = await assignReviewerCampaign(reviewer.id, now);
    const second = await assignReviewerCampaign(reviewer.id, new Date(now.getTime() + 60_000));

    expect(second.assignmentId).toBe(first.assignmentId);
    expect(second.activeAssignment?.assignmentId).toBe(first.assignmentId);
    expect(
      await prisma.receipt.count({
        where: { reviewerId: reviewer.id, source: "CAMPAIGN_ASSIGNMENT" },
      }),
    ).toBe(1);
  });

  it("releases an unsubmitted assignment after five minutes and does not keep the place cooldown", async () => {
    const reviewer = await createReviewer();
    await prisma.campaign.updateMany({ data: { active: false } });
    const fixture = await createCampaign(`google-place-expiry-${uniq()}`, { dailyQuota: 1 });
    const now = new Date("2026-07-21T00:00:00.000Z");

    const assigned = await assignReviewerCampaign(reviewer.id, now);
    const afterExpiry = new Date(now.getTime() + 5 * 60_000);
    const availability = await getReviewerCampaignAvailability(reviewer.id, prisma, afterExpiry);

    expect(assigned.assignmentId).toBeTruthy();
    expect(availability.campaigns.map((campaign) => campaign.id)).toContain(fixture.campaign.id);
    expect(
      await prisma.receipt.findUnique({ where: { id: assigned.assignmentId! } }),
    ).toMatchObject({ status: "EXPIRED" });
  });

  it("hides a campaign when its daily assignment quota is reached", async () => {
    const firstReviewer = await createReviewer();
    const secondReviewer = await createReviewer();
    await prisma.campaign.updateMany({ data: { active: false } });
    const fixture = await createCampaign(`google-place-daily-cap-${uniq()}`, { dailyQuota: 1 });
    const now = new Date("2026-07-21T00:00:00.000Z");

    await assignReviewerCampaign(firstReviewer.id, now);
    const availability = await getReviewerCampaignAvailability(secondReviewer.id, prisma, now);

    expect(availability.campaigns.map((campaign) => campaign.id)).not.toContain(fixture.campaign.id);
  });

  it("does not reserve more slots than the daily quota under concurrent requests", async () => {
    const reviewers = await Promise.all([createReviewer(), createReviewer(), createReviewer()]);
    await prisma.campaign.updateMany({ data: { active: false } });
    const fixture = await createCampaign(`google-place-concurrent-cap-${uniq()}`, {
      dailyQuota: 1,
      totalQuota: 1,
    });
    const now = new Date("2026-07-21T00:00:00.000Z");

    await Promise.allSettled(
      reviewers.map((reviewer) => assignReviewerCampaign(reviewer.id, now)),
    );

    expect(
      await prisma.receipt.count({
        where: {
          campaignId: fixture.campaign.id,
          source: "CAMPAIGN_ASSIGNMENT",
          status: "ASSIGNED",
        },
      }),
    ).toBe(1);
  });

  it("screenshot proof waits for admin approval and credits reward points once", async () => {
    const reviewer = await createReviewer();
    await createCampaign(`google-place-complete-${uniq()}`);
    const assigned = await assignReviewerCampaign(reviewer.id);
    const storedDraftText = "테스트 매장을 방문했고 전반적으로 만족스러운 시간을 보냈습니다.";
    await prisma.receipt.update({
      where: { id: assigned.assignmentId! },
      data: { reviewDraftText: storedDraftText, reviewDraftVersion: 1 },
    });

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

  it("rejects a proof submitted at the expiry boundary and releases the assignment", async () => {
    const reviewer = await createReviewer();
    await prisma.campaign.updateMany({ data: { active: false } });
    await createCampaign(`google-place-expired-proof-${uniq()}`);
    const assignedAt = new Date("2026-07-21T00:00:00.000Z");
    const assigned = await assignReviewerCampaign(reviewer.id, assignedAt);
    await prisma.receipt.update({
      where: { id: assigned.assignmentId! },
      data: {
        reviewDraftText: "테스트 매장에 방문했고 친절한 안내와 깔끔한 공간이 인상적이었습니다.",
        reviewDraftVersion: 1,
      },
    });

    await expect(
      submitReviewerCampaignProof(
        reviewer.id,
        assigned.assignmentId!,
        {
          screenshotUrl: "/uploads/review-proofs/late.png",
          screenshotMimeType: "image/png",
          screenshotOriginalName: "late.png",
          draftText: "테스트 매장에 방문했고 친절한 안내와 깔끔한 공간이 인상적이었습니다.",
          submittedAt: new Date(assignedAt.getTime() + 5 * 60_000),
        },
      ),
    ).rejects.toMatchObject({ code: "ASSIGNMENT_EXPIRED", status: 409 });
    expect(
      await prisma.receipt.findUnique({ where: { id: assigned.assignmentId! } }),
    ).toMatchObject({ status: "EXPIRED", reviewProofSubmittedAt: null });
  });

  it("auto-approves screenshot proof when AI analysis matches the generated draft", async () => {
    const reviewer = await createReviewer();
    await createCampaign(`google-place-auto-approve-${uniq()}`);
    const assigned = await assignReviewerCampaign(reviewer.id);
    const draftText = "테스트 매장에 방문했고 만족스러운 시간을 보냈습니다.";

    await prisma.receipt.update({
      where: { id: assigned.assignmentId! },
      data: { reviewDraftText: draftText, reviewDraftVersion: 1 },
    });

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
    await prisma.campaign.updateMany({ data: { active: false } });
    await createCampaign(`google-place-food-a-${uniq()}`, { category: "음식점" });
    await createCampaign(`google-place-food-b-${uniq()}`, { category: "음식점>한식" });
    await createCampaign(`google-place-cafe-${uniq()}`, { category: "카페" });
    await createCampaign(`google-place-unknown-${uniq()}`, { category: null });

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
