import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  generateCampaignReviewDraftPreview,
  generateCampaignReviewDraftForAssignment,
  nonSpaceLength,
  normalizeCampaignDraftGuidance,
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
  category?: string;
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
  if (options.category) {
    await prisma.externalPlace.updateMany({
      where: { businessId: business.id },
      data: { category: options.category },
    });
  }
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

  it("blocks duplicate place listings without a review, blog, or approved fact", async () => {
    const { reviewer, receipt } = await createAssignment({ googlePlace: true, naverPlace: true });

    await expect(generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id)).rejects.toMatchObject({
      code: "INSUFFICIENT_QUALITY_CONTEXT",
      status: 422,
    });
  });

  it("allows an administrator-approved fact to satisfy the substantive source requirement", async () => {
    const { reviewer, campaign, receipt } = await createAssignment({ googlePlace: true, naverPlace: true });
    await prisma.campaignDraftGuidance.create({
      data: {
        campaignId: campaign.id,
        industry: "BEAUTY_CLINIC",
        approvedFactsJson: JSON.stringify(["피부 상담은 예약제로 운영됩니다."]),
        bannedTermsJson: JSON.stringify(["메뉴", "음식"]),
      },
    });

    const result = await generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id);

    expect(result.sourceGroupCount).toBeGreaterThanOrEqual(2);
    expect(nonSpaceLength(result.text)).toBeGreaterThanOrEqual(30);
    expect(result.text).toContain("피부 상담은 예약제로 운영됩니다.");
    expect(result.text).not.toMatch(/메뉴|음식/);
  });

  it("normalizes sheet guide keywords and review examples as draft guidance", () => {
    expect(
      normalizeCampaignDraftGuidance({
        guideKeywordsJson: JSON.stringify(["강남역 맛집", "친절한 서비스"]),
        reviewExamplesJson: JSON.stringify(["직원분들이 친절했어요."]),
      }),
    ).toMatchObject({
      guideKeywords: ["강남역 맛집", "친절한 서비스"],
      reviewExamples: ["직원분들이 친절했어요."],
    });
  });

  it("generates an admin preview without creating or updating reviewer assignments", async () => {
    const { campaign, receipt } = await createAssignment({
      googlePlace: true,
      naverPlace: true,
      googleReview: true,
    });
    await prisma.campaignDraftGuidance.create({
      data: {
        campaignId: campaign.id,
        guideKeywordsJson: JSON.stringify(["매장이 넓고 쾌적한"]),
        reviewExamplesJson: JSON.stringify(["직원분들이 친절해서 편하게 이용했어요."]),
      },
    });
    const before = await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id } });

    const preview = await generateCampaignReviewDraftPreview(campaign.id);

    const after = await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(preview).toMatchObject({
      campaignId: campaign.id,
      provider: "template",
    });
    expect(nonSpaceLength(preview.text)).toBeGreaterThanOrEqual(30);
    expect(after.reviewDraftText).toBe(before.reviewDraftText);
    expect(after.reviewDraftVersion).toBe(before.reviewDraftVersion);
  });

  it("includes sheet guide keywords and review examples in the Gemini prompt", async () => {
    const { campaign } = await createAssignment({
      googlePlace: true,
      naverPlace: true,
      googleReview: true,
    });
    await prisma.campaignDraftGuidance.create({
      data: {
        campaignId: campaign.id,
        guideKeywordsJson: JSON.stringify(["강남역 샤브샤브", "신선한 야채"]),
        reviewExamplesJson: JSON.stringify(["야채가 신선하고 직원분들이 친절했어요."]),
      },
    });
    process.env.REVIEW_DRAFT_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-api-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "강남역 근처에서 편하게 방문했고 전체적으로 깔끔해서 만족스러운 시간을 보냈습니다.",
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateCampaignReviewDraftPreview(campaign.id);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const prompt = requestBody.contents[0].parts[0].text;
    expect(prompt).toContain("시트 리뷰작성 가이드 키워드: 강남역 샤브샤브, 신선한 야채");
    expect(prompt).toContain("야채가 신선하고 직원분들이 친절했어요.");
  });

  it("generates and stores a 30 to 200 non-space character draft from place data and a substantive source", async () => {
    const { reviewer, receipt } = await createAssignment({ googlePlace: true, naverPlace: true, googleReview: true });

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

  it("expires an assignment before generating a draft after the five-minute deadline", async () => {
    const { reviewer, receipt } = await createAssignment({
      googlePlace: true,
      googleReview: true,
      blogReference: true,
    });
    await prisma.receipt.update({
      where: { id: receipt.id },
      data: { assignmentExpiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(
      generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id),
    ).rejects.toMatchObject({
      code: "ASSIGNMENT_EXPIRED",
      status: 409,
    });
    expect(await prisma.receipt.findUnique({ where: { id: receipt.id } })).toMatchObject({
      status: "EXPIRED",
    });
  });

  it("keeps Gemini output within 200 non-space characters without failing at the boundary", async () => {
    const { reviewer, receipt } = await createAssignment({ googlePlace: true, naverPlace: true, googleReview: true });
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
    const { reviewer, receipt } = await createAssignment({ googlePlace: true, naverPlace: true, googleReview: true });
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

  it("rejects restaurant-style Gemini output for a beauty clinic", async () => {
    const { reviewer, receipt } = await createAssignment({
      googlePlace: true,
      googleReview: true,
      category: "피부과",
    });
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
                      text: "메뉴도 다양하고 매장 분위기를 함께 즐기기 좋은 곳이에요. 음식도 맛있어서 다음에도 방문하고 싶습니다.",
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

    await expect(generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id)).rejects.toMatchObject({
      code: "UNSUITABLE_GENERATED_DRAFT",
      status: 422,
    });
  });
});
