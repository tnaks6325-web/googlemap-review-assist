import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  generateCampaignReviewDraftForAssignment,
  nonSpaceLength,
  REVIEW_DRAFT_MAX_REGENERATIONS,
} from "@/lib/domain/campaign-review-draft";
import { generateUniqueSlug } from "@/lib/domain/codes";

let seq = 0;
const uniq = () => `${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e6)}`;
const originalProvider = process.env.REVIEW_DRAFT_PROVIDER;

async function createReviewer() {
  return prisma.reviewer.create({
    data: { phone: `draft-phone-${uniq()}`, wallet: { create: {} } },
  });
}

async function createAssignment(options: {
  googlePlace?: boolean;
  naverPlace?: boolean;
  googleReview?: boolean;
  blogReference?: boolean;
}) {
  const reviewer = await createReviewer();
  const owner = await prisma.owner.create({
    data: { email: `draft-${uniq()}@test.local`, password: "x" },
  });
  const business = await prisma.business.create({
    data: {
      ownerId: owner.id,
      name: `테스트 매장 ${uniq()}`,
      address: "서울특별시 중구 테스트로 1",
      googlePlaceId: `google-place-${uniq()}`,
      menus: {
        create: [
          { name: "시그니처 메뉴", category: "대표" },
          { name: "커피", category: "음료" },
        ],
      },
      externalPlaces: {
        create: [
          ...(options.googlePlace
            ? [
                {
                  platform: "GOOGLE",
                  externalId: `google-${uniq()}`,
                  name: "테스트 매장",
                  address: "서울특별시 중구 테스트로 1",
                  category: "음식점",
                  rating: 4.8,
                  reviewCount: 12,
                  url: "https://maps.example/test",
                },
              ]
            : []),
          ...(options.naverPlace
            ? [
                {
                  platform: "NAVER",
                  externalId: `naver-${uniq()}`,
                  name: "테스트 매장",
                  address: "서울특별시 중구 테스트로 1",
                  category: "음식점",
                  rating: 4.9,
                  reviewCount: 23,
                  url: "https://pcmap.place.naver.com/restaurant/1/home",
                },
              ]
            : []),
        ],
      },
      externalReviews: options.googleReview
        ? {
            create: {
              platform: "GOOGLE",
              reviewType: "GENERAL",
              rating: 5,
              content: "매장이 깔끔하고 음식이 정갈해서 다시 방문하고 싶었습니다.",
              reviewHash: `review-${uniq()}`,
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
      blogReferences: options.blogReference
        ? {
            create: {
              source: "NAVER_BLOG_SEARCH",
              searchQuery: "테스트 매장",
              title: "테스트 매장 방문 후기",
              description: "분위기가 편하고 대표 메뉴 구성이 좋아 가족 식사로 만족스러웠습니다.",
              link: `https://blog.example/${uniq()}`,
              status: "ACTIVE",
            },
          }
        : undefined,
    },
  });
  const receipt = await prisma.receipt.create({
    data: {
      businessId: business.id,
      campaignId: campaign.id,
      reviewerId: reviewer.id,
      code: `ASSIGN-${uniq()}`,
      source: "CAMPAIGN_ASSIGNMENT",
      dedupeHash: `assignment:${uniq()}`,
      status: "ASSIGNED",
    },
  });
  return { reviewer, business, campaign, receipt };
}

describe("campaign review draft generator", () => {
  beforeEach(() => {
    process.env.REVIEW_DRAFT_PROVIDER = "template";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalProvider == null) delete process.env.REVIEW_DRAFT_PROVIDER;
    else process.env.REVIEW_DRAFT_PROVIDER = originalProvider;
    delete process.env.GEMINI_API_KEY;
  });

  it("blocks draft generation when fewer than two source groups are available", async () => {
    const { reviewer, receipt } = await createAssignment({ googlePlace: true });

    await expect(generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id)).rejects.toMatchObject({
      code: "INSUFFICIENT_CONTEXT",
      status: 422,
    });
  });

  it("generates and stores a 30 to 200 non-space character draft from two or more source groups", async () => {
    const { reviewer, receipt } = await createAssignment({ googlePlace: true, naverPlace: true });

    const result = await generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id);
    const stored = await prisma.receipt.findUnique({ where: { id: receipt.id } });

    expect(result.sourceGroupCount).toBeGreaterThanOrEqual(2);
    expect(nonSpaceLength(result.text)).toBeGreaterThanOrEqual(30);
    expect(nonSpaceLength(result.text)).toBeLessThanOrEqual(200);
    expect(result.provider).toBe("template");
    expect(result.version).toBe(1);
    expect(stored?.reviewDraftText).toBe(result.text);
    expect(stored?.reviewDraftProvider).toBe("template");
    expect(stored?.reviewDraftSourceGroupsJson).toContain("GOOGLE_PLACE");
  });

  it("limits regeneration to three generated drafts per assignment", async () => {
    const { reviewer, receipt } = await createAssignment({
      googlePlace: true,
      googleReview: true,
      blogReference: true,
    });

    for (let i = 0; i < REVIEW_DRAFT_MAX_REGENERATIONS; i += 1) {
      const result = await generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id, {
        regenerate: i > 0,
      });
      expect(result.version).toBe(i + 1);
    }

    await expect(
      generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id, { regenerate: true }),
    ).rejects.toMatchObject({
      code: "REGENERATION_LIMIT_EXCEEDED",
      status: 429,
    });
  });

  it("keeps Gemini output within 200 non-space characters without failing at the boundary", async () => {
    const { reviewer, receipt } = await createAssignment({ googlePlace: true, naverPlace: true });
    process.env.REVIEW_DRAFT_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-api-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "가".repeat(201) }] } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id);

    expect(nonSpaceLength(result.text)).toBeLessThanOrEqual(200);
    expect(result.provider).toBe("gemini");
  });

  it("limits Gemini output to three sentences", async () => {
    const { reviewer, receipt } = await createAssignment({ googlePlace: true, naverPlace: true });
    process.env.REVIEW_DRAFT_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-api-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text:
                        "분위기가 편안해서 식사 시간을 즐기기 좋았습니다. 메뉴 구성이 알차서 만족스러웠어요. 직원분들도 친절해서 편하게 이용했습니다. 다음에도 다시 방문하고 싶어요.",
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id);

    expect(result.text.match(/[.!?]+/g)?.length ?? 0).toBeLessThanOrEqual(3);
  });
});
