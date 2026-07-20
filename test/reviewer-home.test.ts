import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { upsertReviewerPayoutAccount } from "@/lib/domain/settlement";
import {
  getReviewerHomeAccount,
  getReviewerHomeDashboard,
} from "@/lib/domain/reviewer-home";

describe("reviewer home account", () => {
  it("returns only the display-safe Google account fields for the authenticated reviewer", async () => {
    const reviewer = await prisma.reviewer.create({
      data: {
        phone: `0106${String(Date.now()).slice(-7)}`,
        googleSub: `google-home-${Date.now()}`,
        email: "home-reviewer@example.com",
        name: "홈 리뷰어",
        avatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
        wallet: { create: {} },
      },
    });

    const account = await getReviewerHomeAccount(reviewer.id);

    expect(account).toEqual({
      name: "홈 리뷰어",
      email: "home-reviewer@example.com",
      avatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
    });
    expect(account).not.toHaveProperty("id");
    expect(account).not.toHaveProperty("phone");
    expect(account).not.toHaveProperty("googleSub");
  });

  it("returns null when there is no authenticated reviewer", async () => {
    await expect(getReviewerHomeAccount(null)).resolves.toBeNull();
  });

  it("does not present a phone-only reviewer as a connected Google account", async () => {
    const reviewer = await prisma.reviewer.create({
      data: {
        phone: `0105${String(Date.now()).slice(-7)}`,
        name: "전화번호 리뷰어",
        wallet: { create: {} },
      },
    });

    await expect(getReviewerHomeAccount(reviewer.id)).resolves.toBeNull();
  });

  it("does not expose an untrusted avatar URL", async () => {
    const reviewer = await prisma.reviewer.create({
      data: {
        googleSub: `google-home-untrusted-${Date.now()}`,
        email: "avatar-reviewer@example.com",
        name: "아바타 리뷰어",
        avatarUrl: "http://tracking.example.com/avatar.png",
        wallet: { create: {} },
      },
    });

    await expect(getReviewerHomeAccount(reviewer.id)).resolves.toEqual({
      name: "아바타 리뷰어",
      email: "avatar-reviewer@example.com",
      avatarUrl: null,
    });
  });

  it("returns only the authenticated reviewer's participation and account summary", async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const [reviewer, otherReviewer] = await Promise.all([
      prisma.reviewer.create({
        data: {
          googleSub: `dashboard-reviewer-${suffix}`,
          email: `dashboard-${suffix}@example.com`,
          name: "대시보드 리뷰어",
          phone: `0104${String(Date.now()).slice(-7)}`,
          wallet: { create: { balance: 12000 } },
        },
      }),
      prisma.reviewer.create({
        data: {
          googleSub: `other-dashboard-reviewer-${suffix}`,
          email: `other-dashboard-${suffix}@example.com`,
          wallet: { create: { balance: 99000 } },
        },
      }),
    ]);
    const owner = await prisma.owner.create({
      data: { email: `dashboard-owner-${suffix}@example.com`, password: "test" },
    });
    const business = await prisma.business.create({
      data: {
        ownerId: owner.id,
        name: "홈 테스트 매장",
        address: "서울시 테스트로 1",
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        businessId: business.id,
        slug: `dashboard-campaign-${suffix}`,
        name: "홈 테스트 캠페인",
      },
    });

    await upsertReviewerPayoutAccount(reviewer.id, {
      bankName: "하나은행",
      accountNumber: "123-456789-01-234",
      accountHolder: "대시보드 리뷰어",
    });
    await prisma.receipt.createMany({
      data: [
        {
          businessId: business.id,
          campaignId: campaign.id,
          reviewerId: reviewer.id,
          source: "CAMPAIGN_ASSIGNMENT",
          dedupeHash: `dashboard-pending-${suffix}`,
          status: "REVIEW_SUBMITTED",
          reviewProofSubmittedAt: new Date("2026-07-19T12:00:00.000Z"),
        },
        {
          businessId: business.id,
          campaignId: campaign.id,
          reviewerId: reviewer.id,
          source: "CAMPAIGN_ASSIGNMENT",
          dedupeHash: `dashboard-completed-${suffix}`,
          status: "COMPLETED",
          reviewReviewedAt: new Date("2026-07-18T12:00:00.000Z"),
        },
        {
          businessId: business.id,
          campaignId: campaign.id,
          reviewerId: otherReviewer.id,
          source: "CAMPAIGN_ASSIGNMENT",
          dedupeHash: `dashboard-other-${suffix}`,
          status: "REJECTED",
        },
      ],
    });

    const dashboard = await getReviewerHomeDashboard(reviewer.id);

    expect(dashboard).toMatchObject({
      profile: {
        phone: reviewer.phone,
        payoutAccountRegistered: true,
      },
      points: { balance: 12000 },
      participation: {
        totalCount: 2,
        reviewPendingCount: 1,
        completedCount: 1,
      },
    });
    expect(dashboard.participation.items).toHaveLength(2);
    expect(dashboard.participation.items.map((item) => item.status)).toEqual(
      expect.arrayContaining(["REVIEW_SUBMITTED", "COMPLETED"]),
    );
    expect(dashboard.profile).not.toHaveProperty("accountNumber");
    expect(JSON.stringify(dashboard)).not.toContain("99000");
  });
});
