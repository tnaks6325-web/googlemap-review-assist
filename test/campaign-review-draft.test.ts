import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  generateCampaignReviewDraftPreview,
  generateCampaignReviewDraftForAssignment,
  listCampaignPreparedDrafts,
  migrateLegacyCampaignPreparedDrafts,
  updateCampaignPreparedDraft,
  deleteCampaignPreparedDraft,
  deleteCampaignQualityExcludedDrafts,
  promoteCampaignQualityExcludedDraft,
  selectPreparedDraftItemsForStorage,
  nonSpaceLength,
  normalizeCampaignDraftGuidance,
  readGeminiStructuredOutputStream,
  evaluateDraftQualitySequentially,
  REVIEW_DRAFT_MATRIX_BATCH_TIMEOUT_MS,
  REVIEW_DRAFT_MAX_REGENERATIONS,
} from "@/lib/domain/campaign-review-draft";
import { generateUniqueSlug } from "@/lib/domain/codes";
import { REVIEW_DRAFT_STYLE_SLOTS } from "@/lib/domain/review-draft-diversity";

let seq = 0;
const uniq = () => `${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e6)}`;
const originalProvider = process.env.REVIEW_DRAFT_PROVIDER;
const originalV2Flag = process.env.REVIEW_DRAFT_V2_ENABLED;

function geminiSseResponse(textChunks: string[]) {
  return new Response(
    textChunks
      .map((text) =>
        `data: ${JSON.stringify({
          candidates: [{ content: { parts: [{ text }] } }],
        })}\n\n`,
      )
      .join(""),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

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
  totalQuota?: number;
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
      totalQuota: options.totalQuota,
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
    if (originalV2Flag == null) delete process.env.REVIEW_DRAFT_V2_ENABLED;
    else process.env.REVIEW_DRAFT_V2_ENABLED = originalV2Flag;
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
    await prisma.campaignDraftEvidence.createMany({
      data: Array.from({ length: 8 }, (_, index) => ({
        campaignId: campaign.id,
        facet: ["SPACE", "ACCESS", "OPERATIONS", "OTHER"][index % 4],
        fact: `미리보기 검증을 위한 승인 사실 ${index + 1}이 구체적으로 안내되어 있다`,
        sourceType: "ADMIN_APPROVED",
        sourceRef: `preview-approved-${index}`,
        sourceExcerpt: `승인 사실 ${index + 1}`,
        status: "APPROVED",
      })),
    });
    const before = await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id } });

    const preview = await generateCampaignReviewDraftPreview(campaign.id);

    const after = await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(preview).toMatchObject({
      campaignId: campaign.id,
      provider: "template",
      promptVersion: "review-diversity-v6",
    });
    expect(preview.items).toHaveLength(5);
    expect(preview.metrics.styleCoverage).toBe(5);
    expect(nonSpaceLength(preview.text)).toBeGreaterThanOrEqual(30);
    expect(after.reviewDraftText).toBe(before.reviewDraftText);
    expect(after.reviewDraftVersion).toBe(before.reviewDraftVersion);
  });

  it("limits the replacement reserve to the campaign quota when it is smaller than five", async () => {
    const { campaign } = await createAssignment({
      googlePlace: true,
      naverPlace: true,
      googleReview: true,
      totalQuota: 2,
    });
    await prisma.campaignDraftEvidence.createMany({
      data: Array.from({ length: 8 }, (_, index) => ({
        campaignId: campaign.id,
        facet: ["SPACE", "ACCESS", "OPERATIONS", "OTHER"][index % 4],
        fact: `소규모 캠페인 승인 사실 ${index + 1}이 구체적으로 안내되어 있다`,
        sourceType: "ADMIN_APPROVED",
        sourceRef: `small-quota-preview-${index}`,
        sourceExcerpt: `승인 사실 ${index + 1}`,
        status: "APPROVED",
      })),
    });

    const preview = await generateCampaignReviewDraftPreview(campaign.id);
    const history = await listCampaignPreparedDrafts(campaign.id);

    expect(preview.items).toHaveLength(2);
    expect(history.metrics.totalCount).toBe(2);
  });

  it("keeps five existing drafts and stores only the remaining twenty passed drafts", () => {
    const generated = [
      ...Array.from({ length: 25 }, (_, index) => ({
        id: `passed-${index}`,
        qualityPassed: true,
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        id: `excluded-${index}`,
        qualityPassed: false,
      })),
    ];

    const selected = selectPreparedDraftItemsForStorage(generated, 5);

    expect(selected.filter((item) => item.qualityPassed)).toHaveLength(20);
    expect(selected.filter((item) => !item.qualityPassed)).toHaveLength(2);
    expect(selected.map((item) => item.id)).toContain("passed-0");
  });

  it("stores every admin preview item in the replacement reserve", async () => {
    const { campaign } = await createAssignment({
      googlePlace: true,
      naverPlace: true,
      googleReview: true,
    });
    await prisma.campaignDraftEvidence.createMany({
      data: Array.from({ length: 8 }, (_, index) => ({
        campaignId: campaign.id,
        facet: ["SPACE", "ACCESS", "OPERATIONS", "OTHER"][index % 4],
        fact: `누적 저장 검증을 위한 승인 사실 ${index + 1}이 안내되어 있다`,
        sourceType: "ADMIN_APPROVED",
        sourceRef: `stored-preview-${index}`,
        sourceExcerpt: `승인 사실 ${index + 1}`,
        status: "APPROVED",
      })),
    });

    const first = await generateCampaignReviewDraftPreview(campaign.id);
    const firstHistory = await listCampaignPreparedDrafts(campaign.id);
    expect(firstHistory.metrics.totalCount).toBe(first.items.length);
    expect(firstHistory.metrics.unassignedCount).toBe(
      first.items.filter((item) => item.qualityPassed).length,
    );
    expect(firstHistory.metrics.qualityExcludedCount).toBe(
      first.items.filter((item) => !item.qualityPassed).length,
    );
    expect(firstHistory.items).toHaveLength(first.items.length);
    expect(new Set(firstHistory.items.map((item) => item.batchId)).size).toBe(1);
  });

  it("keeps the first distinct candidate and excludes only the later repeated candidate", () => {
    const slot = REVIEW_DRAFT_STYLE_SLOTS.find((candidate) => candidate.structure === "POINT_FIRST");
    if (!slot) throw new Error("point-first slot is required");
    const candidates = [
      {
        text: "메뉴별 특징과 재료 구성이 구체적으로 안내되어 있어요. 방문 전에 여러 선택지를 차분하게 살펴보기 편해요.",
        slot,
      },
      {
        text: "메뉴별 특징과 재료 구성이 구체적으로 안내되어 있어요. 방문 전에 여러 선택지를 차분하게 비교하기 좋아요.",
        slot,
      },
    ];

    const evaluated = evaluateDraftQualitySequentially(candidates, []);

    expect(evaluated.map((item) => item.qualityPassed)).toEqual([true, false]);
  });

  it("excludes generated drafts containing unnatural phrases or percent symbols", () => {
    const slot = REVIEW_DRAFT_STYLE_SLOTS.find((candidate) => candidate.structure === "POINT_FIRST");
    if (!slot) throw new Error("point-first slot is required");

    const evaluated = evaluateDraftQualitySequentially([
      {
        text: "숙련된 솜씨로 메뉴를 준비하는 모습이 보여요. 방문 전에 메뉴 구성을 확인하기 편해요.",
        slot,
      },
      {
        text: "제주산 돼지고기를 100% 취급한다고 안내되어 있어요. 메뉴 종류도 함께 확인할 수 있어요.",
        slot,
      },
    ], []);

    expect(evaluated.map((item) => item.qualityPassed)).toEqual([false, false]);
  });

  it("excludes a generated draft that copies a long phrase from a style reference", () => {
    const slot = REVIEW_DRAFT_STYLE_SLOTS.find((candidate) => candidate.structure === "POINT_FIRST");
    if (!slot) throw new Error("point-first slot is required");
    const text =
      "메뉴별 특징과 재료 구성이 구체적으로 안내되어 있어요. 방문 전에 여러 선택지를 차분하게 살펴보기 편해요.";
    const styleReference =
      "메뉴별 특징과 재료 구성이 구체적으로 안내되어 있어요. 다음에는 다른 메뉴도 골라보고 싶어요.";

    expect(evaluateDraftQualitySequentially([{ text, slot }], [], [styleReference])[0])
      .toMatchObject({ qualityPassed: false });
  });

  it("requires the punctuation assigned to tilde and repeated-exclamation slots", () => {
    const reviewText = "메뉴 구성과 운영 정보가 보기 쉽게 정리되어 있어 방문 전에 차분히 살펴보기 좋아요";
    const cases = [
      ["TILDE", "~"],
      ["DOUBLE_EXCLAMATION", "!!"],
      ["TRIPLE_EXCLAMATION", "!!!"],
    ] as const;

    for (const [punctuationStyle, punctuation] of cases) {
      const slot = REVIEW_DRAFT_STYLE_SLOTS.find(
        (candidate) =>
          candidate.punctuationStyle === punctuationStyle && candidate.structure === "SHORT_SINGLE",
      );
      if (!slot) throw new Error(`${punctuationStyle} short-single slot is required`);

      expect(evaluateDraftQualitySequentially([{ text: `${reviewText}${punctuation}`, slot }], [])[0])
        .toMatchObject({ qualityPassed: true });
      expect(evaluateDraftQualitySequentially([{ text: `${reviewText}.`, slot }], [])[0])
        .toMatchObject({ qualityPassed: false });
    }
  });

  it("bounds each five-draft Gemini batch timeout", () => {
    expect(REVIEW_DRAFT_MATRIX_BATCH_TIMEOUT_MS).toBe(45_000);
  });

  it("reports each completed draft while Gemini structured output is streaming", async () => {
    const progress: number[] = [];
    const items = Array.from({ length: 5 }, (_, index) => ({
      reviewText: `실시간 생성 원고 ${index + 1}번이며 문자열 안의 } 기호는 완료로 세지 않습니다.`,
      styleId: `style-${index + 1}`,
      evidenceIds: [`evidence-${index + 1}`],
      promptVersion: "review-diversity-v6",
    }));
    const response = geminiSseResponse([
      '{"items":[',
      ...items.map((item, index) => `${index ? "," : ""}${JSON.stringify(item)}`),
      "]}",
    ]);

    const text = await readGeminiStructuredOutputStream(response, (count) => {
      progress.push(count);
    });

    expect(JSON.parse(text)).toEqual({ items });
    expect(progress).toEqual([1, 2, 3, 4, 5]);
  });

  it("generates the five-draft reserve in one bounded batch", async () => {
    const { campaign } = await createAssignment({
      googlePlace: true,
      naverPlace: true,
      googleReview: true,
    });
    const evidence = await prisma.campaignDraftEvidence.create({
      data: {
        campaignId: campaign.id,
        facet: "MENU_PRODUCT",
        fact: "신선한 재료 구성이 구체적으로 안내되어 있다",
        sourceType: "ADMIN_APPROVED",
        sourceRef: "bounded-matrix-batch-test",
        sourceExcerpt: "신선한 재료 구성",
        status: "APPROVED",
      },
    });
    process.env.REVIEW_DRAFT_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-api-key";
    const fetchMock = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const requestBody = JSON.parse(String(init.body));
      const styleIds = requestBody.generationConfig.responseSchema.properties.items.items
        .properties.styleId.enum as string[] | undefined;
      if (!styleIds || styleIds.length > 5) {
        throw new Error("matrix request was not split into bounded style batches");
      }
      const items = styleIds.map((styleId) => {
        const slot = REVIEW_DRAFT_STYLE_SLOTS.find((candidate) => candidate.id === styleId);
        if (!slot) throw new Error(`unknown test style ${styleId}`);
        return {
          reviewText:
            slot.structure === "SHORT_SINGLE"
              ? "신선한 재료 구성이 구체적으로 안내되어 있어 필요한 내용을 방문 전에 차분하게 확인하기 좋아 보여요"
              : slot.structure === "THREE_STEP"
                ? "신선한 재료 구성이 안내되어 있어요. 필요한 정보를 구체적으로 확인할 수 있습니다. 방문 전에 살펴볼 내용까지 정리되어 있어요."
                : "신선한 재료 구성이 구체적으로 안내되어 있어요. 방문 전에 필요한 내용을 차분하게 확인하기 좋아 보입니다.",
          styleId,
          evidenceIds: [evidence.id],
          promptVersion: "review-diversity-v6",
        };
      });
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ items }) }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const progress: number[] = [];

    const preview = await generateCampaignReviewDraftPreview(campaign.id, prisma, (count) => {
      progress.push(count);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(preview.items).toHaveLength(5);
    expect(progress).toEqual(Array.from({ length: 5 }, (_, index) => index + 1));
  });

  it("reports each completed matrix item while the preview is generated", async () => {
    const { campaign } = await createAssignment({
      googlePlace: true,
      googleReview: true,
    });
    await prisma.campaignDraftEvidence.create({
      data: {
        campaignId: campaign.id,
        facet: "SERVICE",
        fact: "예약제로 운영합니다.",
        sourceType: "ADMIN",
        sourceRef: "progress-test",
        sourceExcerpt: "예약제로 운영합니다.",
        status: "APPROVED",
      },
    });
    const progress: number[] = [];

    await generateCampaignReviewDraftPreview(campaign.id, prisma, (count) => {
      progress.push(count);
    });

    expect(progress).toEqual(Array.from({ length: 5 }, (_, index) => index + 1));
  });

  it("migrates legacy prepared drafts exactly once without deleting the originals", async () => {
    const { campaign } = await createAssignment({
      googlePlace: true,
      googleReview: true,
    });
    const generatedAt = new Date("2026-07-20T03:00:00.000Z");
    const legacy = await prisma.campaignReviewDraft.create({
      data: {
        campaignId: campaign.id,
        sequence: 5,
        text: "기존에 저장되어 있던 검수 통과 원고입니다.",
        provider: "gemini",
        model: "gemini-3.5-flash",
        sourceGroupsJson: JSON.stringify([
          { key: "GOOGLE_PLACE", label: "Google 장소", count: 1 },
          { key: "GOOGLE_REVIEWS", label: "Google 리뷰", count: 1 },
        ]),
        contextHash: "legacy-context",
        generatedAt,
        styleId: "legacy-style",
        evidenceIdsJson: JSON.stringify(["evidence-1"]),
        similarity: 0.12,
        promptVersion: "legacy-v1",
      },
    });

    await migrateLegacyCampaignPreparedDrafts(campaign.id, prisma);
    await migrateLegacyCampaignPreparedDrafts(campaign.id, prisma);

    const history = await listCampaignPreparedDrafts(campaign.id, prisma);
    expect(history.metrics).toMatchObject({
      totalCount: 1,
      unassignedCount: 1,
      assignedCount: 0,
      batchCount: 1,
    });
    expect(history.items[0]).toMatchObject({
      text: legacy.text,
      status: "UNASSIGNED",
      provider: legacy.provider,
      model: legacy.model,
      promptVersion: legacy.promptVersion,
    });
    await expect(
      prisma.campaignReviewDraft.count({ where: { id: legacy.id } }),
    ).resolves.toBe(1);
  });

  it("assigns a stored unassigned draft before generating a new reviewer draft", async () => {
    const { reviewer, campaign, receipt } = await createAssignment({
      googlePlace: true,
      naverPlace: true,
      googleReview: true,
    });
    await prisma.campaignDraftEvidence.createMany({
      data: Array.from({ length: 8 }, (_, index) => ({
        campaignId: campaign.id,
        facet: ["SPACE", "ACCESS", "OPERATIONS", "OTHER"][index % 4],
        fact: `원고 배정 검증을 위한 승인 사실 ${index + 1}이 안내되어 있다`,
        sourceType: "ADMIN_APPROVED",
        sourceRef: `assignment-preview-${index}`,
        sourceExcerpt: `승인 사실 ${index + 1}`,
        status: "APPROVED",
      })),
    });
    const storedText = "저장된 정상 원고를 리뷰어에게 우선 배정하는 흐름을 확인하기 위한 충분한 길이의 테스트 원고입니다.";
    await prisma.campaignPreparedDraftBatch.create({
      data: {
        campaignId: campaign.id,
        provider: "template",
        model: "template-v2",
        sourceGroupsJson: "[]",
        sourceGroupCount: 2,
        promptVersion: "review-diversity-v6",
        metricsJson: "{}",
        drafts: {
          create: {
            campaignId: campaign.id,
            slot: 0,
            styleId: "stored-test-style",
            toneLabel: "담백형",
            structureLabel: "세부 우선",
            text: storedText,
            evidenceIdsJson: "[]",
            maxSimilarity: 0.1,
            qualityPassed: true,
          },
        },
      },
    });

    const result = await generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id);
    const history = await listCampaignPreparedDrafts(campaign.id);

    expect(result.text).toBe(storedText);
    expect(result.reused).toBe(true);
    expect(history.metrics.assignedCount).toBe(1);
    expect(history.metrics.unassignedCount).toBe(0);
    expect(history.items.find((item) => item.assignmentId === receipt.id)?.text).toBe(result.text);
  });

  it("excludes a legacy prepared draft that is missing its assigned guide keyword", async () => {
    const { reviewer, campaign, receipt } = await createAssignment({
      googlePlace: true,
      naverPlace: true,
      googleReview: true,
    });
    await prisma.campaignDraftGuidance.create({
      data: {
        campaignId: campaign.id,
        guideKeywordsJson: JSON.stringify(["필수 방문 키워드"]),
      },
    });
    const missingKeywordText = "기존에 저장됐지만 필수 문구가 빠진 원고는 리뷰어에게 배정되면 안 됩니다.";
    const compliantText = "필수 방문 키워드 관련 정보가 구체적으로 안내되어 있어 방문 전에 살펴보기 좋습니다.";
    await prisma.campaignPreparedDraftBatch.create({
      data: {
        campaignId: campaign.id,
        provider: "template",
        model: "template-v2",
        sourceGroupsJson: "[]",
        sourceGroupCount: 2,
        promptVersion: "review-diversity-v6",
        metricsJson: "{}",
        drafts: {
          create: [missingKeywordText, compliantText].map((text, slot) => ({
            campaignId: campaign.id,
            slot,
            styleId: `guide-keyword-style-${slot}`,
            toneLabel: "담백형",
            structureLabel: "세부 우선",
            text,
            evidenceIdsJson: "[]",
            maxSimilarity: 0.1,
            qualityPassed: true,
          })),
        },
      },
    });

    const result = await generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id);
    const history = await listCampaignPreparedDrafts(campaign.id);

    expect(result.text).toBe(compliantText);
    expect(history.metrics.assignedCount).toBe(1);
    expect(history.metrics.qualityExcludedCount).toBe(1);
    expect(history.items.find((item) => item.text === missingKeywordText)?.status)
      .toBe("QUALITY_EXCLUDED");
  });

  it("consumes only one prepared draft when the same assignment requests concurrently", async () => {
    const { reviewer, campaign, receipt } = await createAssignment({
      googlePlace: true,
      naverPlace: true,
      googleReview: true,
    });
    await prisma.campaignPreparedDraftBatch.create({
      data: {
        campaignId: campaign.id,
        provider: "template",
        model: "template-v2",
        sourceGroupsJson: "[]",
        sourceGroupCount: 2,
        promptVersion: "review-diversity-v6",
        metricsJson: "{}",
        drafts: {
          create: [0, 1].map((slot) => ({
            campaignId: campaign.id,
            slot,
            styleId: `concurrent-style-${slot}`,
            toneLabel: "담백형",
            structureLabel: "세부 우선",
            text: `동시 배정 검증용 저장 원고 ${slot + 1}번이며 한 참여건에는 한 건만 소비되어야 합니다.`,
            evidenceIdsJson: "[]",
            maxSimilarity: 0.1,
            qualityPassed: true,
          })),
        },
      },
    });

    const attempts = await Promise.allSettled([
      generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id),
      generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id),
    ]);
    const stored = await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id } });
    const assigned = await prisma.campaignPreparedDraft.findMany({
      where: { assignedReceiptId: receipt.id },
    });

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(assigned).toHaveLength(1);
    expect(assigned[0]?.text).toBe(stored.reviewDraftText);
  });

  it("assigns every sheet guide keyword to preview slots and requires it in generated drafts", async () => {
    const { campaign } = await createAssignment({
      googlePlace: true,
      naverPlace: true,
      googleReview: true,
    });
    const guideKeywords = ["강남역 샤브샤브", "신선한 야채"];
    await prisma.campaignDraftGuidance.create({
      data: {
        campaignId: campaign.id,
        guideKeywordsJson: JSON.stringify(guideKeywords),
        reviewExamplesJson: JSON.stringify(["야채가 신선하고 직원분들이 친절했어요."]),
      },
    });
    const evidence = await prisma.campaignDraftEvidence.create({
      data: {
        campaignId: campaign.id,
        facet: "MENU_PRODUCT",
        fact: "신선한 야채 구성이 안내되어 있다",
        sourceType: "ADMIN_APPROVED",
        sourceRef: "prompt-test-approved",
        sourceExcerpt: "신선한 야채",
        status: "APPROVED",
      },
    });
    await prisma.campaignPreparedDraftRevision.create({
      data: {
        campaignId: campaign.id,
        draftId: "deleted-draft-for-correction-history",
        adminId: "prompt-test-admin",
        beforeText: "온라인을 통해 예약할 수 있고 직원들이 숙련된 솜씨로 안내하는 곳입니다.",
        afterText: "네이버 예약이 가능하고 직원분들이 차분하게 안내해 줘서 이용하기 편했어요.",
      },
    });
    process.env.REVIEW_DRAFT_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-api-key";
    const fetchMock = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const requestBody = JSON.parse(String(init.body));
      const styleIds = requestBody.generationConfig.responseSchema.properties.items.items
        .properties.styleId.enum as string[];
      return new Response(
        JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  items: REVIEW_DRAFT_STYLE_SLOTS.filter((slot) => styleIds.includes(slot.id)).map((slot) => {
                    const requiredGuideKeyword = guideKeywords[slot.index % guideKeywords.length];
                    return {
                      reviewText:
                        slot.structure === "SHORT_SINGLE"
                          ? `${requiredGuideKeyword} 구성이 안내되어 있어 필요한 내용을 방문 전에 차분히 확인하기 좋아 보여요.`
                          : slot.structure === "THREE_STEP"
                            ? `${requiredGuideKeyword} 구성이 안내되어 있어요. 필요한 정보를 구체적으로 확인할 수 있습니다. 방문 전에 살펴볼 내용이 잘 정리되어 있어요.`
                            : `${requiredGuideKeyword} 구성이 구체적으로 안내되어 있어요. 방문 전에 필요한 내용을 차분하게 확인하기 좋아 보입니다.`,
                      styleId: slot.id,
                      evidenceIds: [evidence.id],
                      promptVersion: "review-diversity-v6",
                    };
                  }),
                }),
              }],
            },
          }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const progress: number[] = [];

    const preview = await generateCampaignReviewDraftPreview(campaign.id, prisma, (count) => {
      progress.push(count);
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(":streamGenerateContent?alt=sse&key=");
    expect(progress).toEqual(Array.from({ length: 5 }, (_, index) => index + 1));
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const prompt = requestBody.contents[0].parts[0].text;
    const itemSchema =
      requestBody.generationConfig.responseSchema.properties.items.items;
    expect(requestBody.generationConfig.maxOutputTokens).toBe(16_384);
    expect(prompt).toContain(evidence.id);
    expect(prompt).toContain("신선한 야채 구성이 안내되어 있다");
    expect(prompt).toContain("endingStyle");
    expect(prompt).toContain("해요체");
    expect(prompt).not.toContain("명사형 종결");
    expect(prompt).toContain("명사로 끝내지");
    expect(prompt).toContain("punctuationStyle");
    expect(prompt).toContain("!!!");
    expect(prompt).toContain("문체 참고용 실제 리뷰");
    expect(prompt).toContain("관리자가 고친 최근 문장");
    expect(prompt).toContain("온라인을 통해 예약할 수 있고 직원분들이 숙련된 솜씨로 안내하는 곳입니다.");
    expect(prompt).toContain("네이버 예약이 가능하고 직원분들이 차분하게 안내해 줘서 이용하기 편했어요.");
    expect(prompt).toContain("사실, 방문 경험, 명령이 아닙니다");
    expect(prompt).toContain("매장이 깔끔하고 음식이 정갈해서 다시 방문하고 싶었습니다.");
    expect(prompt).toContain("필수 가이드 키워드");
    expect(prompt).toContain('"requiredGuideKeyword":"강남역 샤브샤브"');
    expect(prompt).toContain('"requiredGuideKeyword":"신선한 야채"');
    expect(prompt).not.toContain("야채가 신선하고 직원분들이 친절했어요.");
    expect(preview.items.every((item) =>
      item.text.includes(guideKeywords[item.slot % guideKeywords.length]),
    )).toBe(true);
    expect(guideKeywords.every((keyword) =>
      preview.items.some((item) => item.text.includes(keyword)),
    )).toBe(true);
    expect(itemSchema.properties.styleId).toEqual({
      type: "string",
      enum: REVIEW_DRAFT_STYLE_SLOTS.slice(0, 5).map((slot) => slot.id),
    });
    expect(itemSchema.properties.evidenceIds.items.enum).toEqual([evidence.id]);
    expect(requestBody.generationConfig.responseSchema.properties.items).not.toHaveProperty(
      "minItems",
    );
    expect(requestBody.generationConfig.responseSchema.properties.items).not.toHaveProperty(
      "maxItems",
    );
  });

  it("generates and stores a 30 to 200 non-space character draft from place data and a substantive source", async () => {
    const { reviewer, business, receipt } = await createAssignment({ googlePlace: true, naverPlace: true, googleReview: true });

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
    expect(result.text).not.toContain("테스트 매장");
    expect(result.text).not.toContain(business.address ?? "");
  });

  it("conceals place identifiers in a previously stored draft before returning it", async () => {
    const { reviewer, business, receipt } = await createAssignment({
      googlePlace: true,
      naverPlace: true,
      googleReview: true,
    });
    await prisma.receipt.update({
      where: { id: receipt.id },
      data: {
        reviewDraftText:
          "테스트 매장은 서울특별시 중구 테스트로 1에 있어 방문하기 편했고 전체적으로 만족스러웠습니다.",
        reviewDraftVersion: 1,
      },
    });

    const result = await generateCampaignReviewDraftForAssignment(
      reviewer.id,
      receipt.id,
    );
    const stored = await prisma.receipt.findUniqueOrThrow({
      where: { id: receipt.id },
    });

    expect(result.reused).toBe(true);
    expect(result.text).not.toContain("테스트 매장");
    expect(result.text).not.toContain(business.address ?? "");
    expect(stored.reviewDraftText).toBe(result.text);
  });

  it("conceals alternate Naver place names as well as the selected Google name", async () => {
    const { reviewer, business, receipt } = await createAssignment({
      googlePlace: true,
      naverPlace: true,
      googleReview: true,
    });
    await prisma.externalPlace.updateMany({
      where: { businessId: business.id, platform: "NAVER" },
      data: {
        name: "네이버 전용 상호명",
        address: "서울특별시 중구 네이버로 99",
      },
    });
    await prisma.receipt.update({
      where: { id: receipt.id },
      data: {
        reviewDraftText:
          "네이버 전용 상호명은 서울특별시 중구 네이버로 99에 있어 찾기 편했고 전반적으로 만족스러웠습니다.",
        reviewDraftVersion: 1,
      },
    });

    const result = await generateCampaignReviewDraftForAssignment(
      reviewer.id,
      receipt.id,
    );

    expect(result.text).not.toContain("네이버 전용 상호명");
    expect(result.text).not.toContain("서울특별시 중구 네이버로 99");
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

  it("reserves and persists a v2 style slot with approved evidence", async () => {
    const { reviewer, campaign, receipt } = await createAssignment({
      googlePlace: true,
      googleReview: true,
      blogReference: true,
    });
    await prisma.campaignDraftEvidence.createMany({
      data: [
        ["SPACE", "내부 공간이 구역별로 정돈되어 있다"],
        ["SPACE", "좌석 사이의 이동 공간이 구분되어 있다"],
        ["ACCESS", "대중교통 접근 정보를 확인할 수 있다"],
        ["ACCESS", "위치 안내가 지도에 구체적으로 등록되어 있다"],
        ["OPERATIONS", "운영 관련 정보가 온라인에 안내되어 있다"],
        ["OTHER", "이용 전에 참고할 장소 정보가 정리되어 있다"],
      ].map(([facet, fact], index) => ({
        campaignId: campaign.id,
        facet,
        fact,
        sourceType: "ADMIN_APPROVED",
        sourceRef: `approved-test-${index}`,
        sourceExcerpt: fact,
        status: "APPROVED",
      })),
    });
    await prisma.campaignDraftGuidance.create({
      data: {
        campaignId: campaign.id,
        guideKeywordsJson: JSON.stringify(["예약 방문", "차분한 공간"]),
      },
    });
    process.env.REVIEW_DRAFT_V2_ENABLED = "true";

    const result = await generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id);
    const stored = await prisma.receipt.findUniqueOrThrow({ where: { id: receipt.id } });

    expect(result).toMatchObject({
      slot: 0,
      promptVersion: "review-diversity-v6",
      model: "template-v2",
    });
    expect(result.styleId).toContain("v2-01");
    expect(result.text).toContain("예약 방문");
    expect(result.evidenceIds?.length).toBeGreaterThan(0);
    expect(stored.reviewDraftSequence).toBe(0);
    expect(stored.reviewDraftStyleId).toBe(result.styleId);
    expect(stored.reviewDraftEvidenceIdsJson).toContain(result.evidenceIds?.[0] ?? "");
  });

  it("assigns distinct v2 sequences to concurrent campaign drafts", async () => {
    const { reviewer, business, campaign, receipt } = await createAssignment({
      googlePlace: true,
      googleReview: true,
      blogReference: true,
    });
    const secondReviewer = await createReviewer();
    const secondReceipt = await prisma.receipt.create({
      data: {
        businessId: business.id,
        campaignId: campaign.id,
        reviewerId: secondReviewer.id,
        code: `ASSIGN-${uniq()}`,
        source: "CAMPAIGN_ASSIGNMENT",
        dedupeHash: `assignment:${uniq()}`,
        status: "ASSIGNED",
      },
    });
    await prisma.campaignDraftEvidence.createMany({
      data: [
        ["SPACE", "내부 공간이 구역별로 정돈되어 있다"],
        ["SPACE", "좌석 사이의 이동 공간이 구분되어 있다"],
        ["ACCESS", "대중교통 접근 정보를 확인할 수 있다"],
        ["ACCESS", "위치 안내가 지도에 구체적으로 등록되어 있다"],
        ["OPERATIONS", "운영 관련 정보가 온라인에 안내되어 있다"],
        ["OTHER", "이용 전에 참고할 장소 정보가 정리되어 있다"],
      ].map(([facet, fact], index) => ({
        campaignId: campaign.id,
        facet,
        fact,
        sourceType: "ADMIN_APPROVED",
        sourceRef: `concurrent-approved-${index}`,
        sourceExcerpt: fact,
        status: "APPROVED",
      })),
    });
    process.env.REVIEW_DRAFT_V2_ENABLED = "true";

    const [first, second] = await Promise.all([
      generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id),
      generateCampaignReviewDraftForAssignment(secondReviewer.id, secondReceipt.id),
    ]);

    expect(new Set([first.slot, second.slot]).size).toBe(2);
    const stored = await prisma.receipt.findMany({
      where: { id: { in: [receipt.id, secondReceipt.id] } },
      select: { reviewDraftSequence: true },
    });
    expect(new Set(stored.map((row) => row.reviewDraftSequence)).size).toBe(2);
  });

  it("uses a pending legacy fact card automatically without manual approval", async () => {
    const { reviewer, campaign, receipt } = await createAssignment({
      googlePlace: true,
      googleReview: true,
    });
    await prisma.campaignDraftEvidence.createMany({
      data: [
        ["SPACE", "내부 공간이 구역별로 정돈되어 있다"],
        ["SPACE", "좌석 사이의 이동 공간이 구분되어 있다"],
        ["ACCESS", "대중교통 접근 정보를 확인할 수 있다"],
        ["ACCESS", "위치 안내가 지도에 구체적으로 등록되어 있다"],
        ["OPERATIONS", "운영 관련 정보가 온라인에 안내되어 있다"],
        ["OTHER", "이용 전에 참고할 장소 정보가 정리되어 있다"],
      ].map(([facet, fact], index) => ({
        campaignId: campaign.id,
        facet,
        fact,
        sourceType: "GOOGLE_PLACE",
        sourceRef: `legacy-pending-source-${index}`,
        sourceExcerpt: fact,
        status: "PENDING",
      })),
    });
    process.env.REVIEW_DRAFT_V2_ENABLED = "true";

    const result = await generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id);

    expect(result.evidenceIds?.length).toBeGreaterThan(0);
  });

  it("updates an unassigned prepared draft after normalization and quality validation", async () => {
    const { campaign } = await createAssignment({ googlePlace: true, googleReview: true });
    const batch = await prisma.campaignPreparedDraftBatch.create({
      data: {
        campaignId: campaign.id,
        provider: "gemini",
        model: "gemini-3.5-flash",
        sourceGroupsJson: "[]",
        sourceGroupCount: 2,
        promptVersion: "review-diversity-v6",
        metricsJson: "{}",
      },
    });
    const draft = await prisma.campaignPreparedDraft.create({
      data: {
        campaignId: campaign.id,
        batchId: batch.id,
        slot: 0,
        styleId: "editable-style",
        toneLabel: "친근형",
        structureLabel: "세부 우선",
        text: "수정하기 전 원고이며 충분한 길이를 갖춘 정상적인 테스트 문장입니다.",
        maxSimilarity: 0,
        qualityPassed: true,
      },
    });

    const adminId = `admin-${uniq()}`;
    const updated = await updateCampaignPreparedDraft(campaign.id, draft.id, {
      text: "직원들이 안내하는 메뉴 정보가 보기 쉽게 정리되어 있어 방문 전에 차분하게 살펴보기 좋아요.",
      adminId,
    });

    expect(updated).toMatchObject({
      id: draft.id,
      status: "UNASSIGNED",
      qualityPassed: true,
    });
    expect(updated.text).toContain("직원분들이");
    expect(updated.text).not.toContain("직원들이");
    await expect(prisma.campaignPreparedDraftRevision.findFirstOrThrow({
      where: { campaignId: campaign.id, draftId: draft.id },
    })).resolves.toMatchObject({
      adminId,
      beforeText: "수정하기 전 원고이며 충분한 길이를 갖춘 정상적인 테스트 문장입니다.",
      afterText: updated.text,
    });
  });

  it("warns about an unnatural administrator edit and saves it only after an explicit override", async () => {
    const { campaign } = await createAssignment({ googlePlace: true, googleReview: true });
    const batch = await prisma.campaignPreparedDraftBatch.create({
      data: {
        campaignId: campaign.id,
        provider: "gemini",
        model: "gemini-3.5-flash",
        sourceGroupsJson: "[]",
        sourceGroupCount: 2,
        promptVersion: "review-diversity-v6",
        metricsJson: "{}",
      },
    });
    const originalText = "수정 전 상태를 유지해야 하는 충분한 길이의 정상적인 테스트 원고입니다.";
    const draft = await prisma.campaignPreparedDraft.create({
      data: {
        campaignId: campaign.id,
        batchId: batch.id,
        slot: 0,
        styleId: "invalid-edit-style",
        toneLabel: "담백형",
        structureLabel: "핵심 우선",
        text: originalText,
        maxSimilarity: 0,
        qualityPassed: false,
      },
    });

    const adminId = `admin-${uniq()}`;
    const editedText = "온라인을 통해 간편하게 예약할 수 있고 숙련된 솜씨가 돋보이는 곳이에요.";
    await expect(updateCampaignPreparedDraft(campaign.id, draft.id, {
      text: editedText,
      adminId,
    })).rejects.toMatchObject({
      code: "DRAFT_REVIEW_REQUIRED",
      status: 409,
      warnings: expect.arrayContaining([
        expect.stringContaining("온라인을 통해"),
        expect.stringContaining("숙련된 솜씨"),
      ]),
    });
    await expect(prisma.campaignPreparedDraft.findUniqueOrThrow({ where: { id: draft.id } }))
      .resolves.toMatchObject({ text: originalText, qualityPassed: false });
    await expect(prisma.campaignPreparedDraftRevision.count({
      where: { campaignId: campaign.id, draftId: draft.id },
    })).resolves.toBe(0);

    await expect(updateCampaignPreparedDraft(campaign.id, draft.id, {
      text: editedText,
      adminId,
      force: true,
    })).resolves.toMatchObject({ text: editedText, qualityPassed: true, status: "UNASSIGNED" });
    await expect(prisma.campaignPreparedDraftRevision.findFirstOrThrow({
      where: { campaignId: campaign.id, draftId: draft.id },
    })).resolves.toMatchObject({ adminId, beforeText: originalText, afterText: editedText });
  });

  it("keeps the 30-to-200 character storage boundary even with a warning override", async () => {
    const { campaign } = await createAssignment({ googlePlace: true, googleReview: true });
    const batch = await prisma.campaignPreparedDraftBatch.create({
      data: {
        campaignId: campaign.id,
        provider: "gemini",
        model: "gemini-3.5-flash",
        sourceGroupsJson: "[]",
        sourceGroupCount: 2,
        promptVersion: "review-diversity-v6",
        metricsJson: "{}",
      },
    });
    const draft = await prisma.campaignPreparedDraft.create({
      data: {
        campaignId: campaign.id,
        batchId: batch.id,
        slot: 0,
        styleId: "forced-length-boundary-style",
        toneLabel: "담백형",
        structureLabel: "핵심 우선",
        text: "길이 검증을 유지하는 데 필요한 충분한 길이의 기존 테스트 원고입니다.",
        maxSimilarity: 0,
        qualityPassed: false,
      },
    });

    await expect(updateCampaignPreparedDraft(campaign.id, draft.id, {
      text: "너무 짧아요.",
      adminId: `admin-${uniq()}`,
      force: true,
    })).rejects.toMatchObject({ code: "INVALID_DRAFT_TEXT", status: 422 });
  });

  it("warns before promoting a quality-excluded draft and allows an explicit override", async () => {
    const { campaign } = await createAssignment({ googlePlace: true, googleReview: true });
    const batch = await prisma.campaignPreparedDraftBatch.create({
      data: {
        campaignId: campaign.id,
        provider: "gemini",
        model: "gemini-3.5-flash",
        sourceGroupsJson: "[]",
        sourceGroupCount: 2,
        promptVersion: "review-diversity-v6",
        metricsJson: "{}",
      },
    });
    const draft = await prisma.campaignPreparedDraft.create({
      data: {
        campaignId: campaign.id,
        batchId: batch.id,
        slot: 0,
        styleId: "quality-override-style",
        toneLabel: "친근형",
        structureLabel: "핵심 우선",
        text: "관리자가 품질 제외 상태를 검토한 뒤 미배정으로 옮기는 충분한 길이의 원고입니다.",
        maxSimilarity: 0.72,
        qualityPassed: false,
      },
    });

    await expect(promoteCampaignQualityExcludedDraft(campaign.id, draft.id))
      .rejects.toMatchObject({
        code: "DRAFT_REVIEW_REQUIRED",
        status: 409,
        warnings: expect.arrayContaining([expect.stringContaining("품질 검사에서 제외")]),
      });
    await expect(prisma.campaignPreparedDraft.findUniqueOrThrow({ where: { id: draft.id } }))
      .resolves.toMatchObject({ qualityPassed: false });

    await expect(promoteCampaignQualityExcludedDraft(campaign.id, draft.id, { force: true }))
      .resolves.toMatchObject({ id: draft.id, qualityPassed: true, status: "UNASSIGNED" });
    await expect(prisma.campaignPreparedDraft.findUniqueOrThrow({ where: { id: draft.id } }))
      .resolves.toMatchObject({ text: draft.text, qualityPassed: true, maxSimilarity: 0.72 });
  });

  it("bulk deletes only unassigned quality-excluded drafts and preserves revision history", async () => {
    const { campaign, receipt } = await createAssignment({ googlePlace: true, googleReview: true });
    const batch = await prisma.campaignPreparedDraftBatch.create({
      data: {
        campaignId: campaign.id,
        provider: "gemini",
        model: "gemini-3.5-flash",
        sourceGroupsJson: "[]",
        sourceGroupCount: 2,
        promptVersion: "review-diversity-v6",
        metricsJson: "{}",
      },
    });
    const [excluded, unassigned, assigned] = await Promise.all([
      prisma.campaignPreparedDraft.create({
        data: { campaignId: campaign.id, batchId: batch.id, slot: 0, styleId: "bulk-excluded", toneLabel: "담백형", structureLabel: "핵심 우선", text: "일괄 삭제 대상인 품질 제외 테스트 원고이며 길이도 충분합니다.", maxSimilarity: 0.8, qualityPassed: false },
      }),
      prisma.campaignPreparedDraft.create({
        data: { campaignId: campaign.id, batchId: batch.id, slot: 1, styleId: "bulk-unassigned", toneLabel: "담백형", structureLabel: "핵심 우선", text: "일괄 삭제에서 보존되어야 하는 미배정 테스트 원고이며 길이도 충분합니다.", maxSimilarity: 0, qualityPassed: true },
      }),
      prisma.campaignPreparedDraft.create({
        data: { campaignId: campaign.id, batchId: batch.id, slot: 2, styleId: "bulk-assigned", toneLabel: "담백형", structureLabel: "핵심 우선", text: "일괄 삭제에서 보존되어야 하는 배정 완료 테스트 원고이며 길이도 충분합니다.", maxSimilarity: 0, qualityPassed: true, assignedReceiptId: receipt.id, assignedAt: new Date() },
      }),
    ]);
    await prisma.campaignPreparedDraftRevision.create({
      data: { campaignId: campaign.id, draftId: excluded.id, adminId: "admin-history", beforeText: "수정 전 품질 제외 원고입니다.", afterText: excluded.text },
    });

    await expect(deleteCampaignQualityExcludedDrafts(campaign.id)).resolves.toEqual({ deletedCount: 1 });
    await expect(prisma.campaignPreparedDraft.findMany({ where: { campaignId: campaign.id } }))
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: unassigned.id }),
        expect.objectContaining({ id: assigned.id }),
      ]));
    await expect(prisma.campaignPreparedDraftRevision.count({ where: { draftId: excluded.id } }))
      .resolves.toBe(1);
  });

  it("deletes only unassigned or quality-excluded prepared drafts", async () => {
    const { campaign, receipt } = await createAssignment({ googlePlace: true, googleReview: true });
    const batch = await prisma.campaignPreparedDraftBatch.create({
      data: {
        campaignId: campaign.id,
        provider: "gemini",
        model: "gemini-3.5-flash",
        sourceGroupsJson: "[]",
        sourceGroupCount: 2,
        promptVersion: "review-diversity-v6",
        metricsJson: "{}",
      },
    });
    const [deletable, assigned] = await Promise.all([
      prisma.campaignPreparedDraft.create({
        data: {
          campaignId: campaign.id,
          batchId: batch.id,
          slot: 0,
          styleId: "deletable-style",
          toneLabel: "담백형",
          structureLabel: "핵심 우선",
          text: "삭제 가능한 미배정 원고이며 충분한 길이를 갖춘 테스트 문장입니다.",
          maxSimilarity: 0,
          qualityPassed: true,
        },
      }),
      prisma.campaignPreparedDraft.create({
        data: {
          campaignId: campaign.id,
          batchId: batch.id,
          slot: 1,
          styleId: "assigned-style",
          toneLabel: "담백형",
          structureLabel: "핵심 우선",
          text: "이미 배정되어 변경할 수 없는 충분한 길이의 테스트 원고입니다.",
          maxSimilarity: 0,
          qualityPassed: true,
          assignedReceiptId: receipt.id,
          assignedAt: new Date(),
        },
      }),
    ]);

    await expect(deleteCampaignPreparedDraft(campaign.id, deletable.id))
      .resolves.toEqual({ deletedId: deletable.id });
    await expect(deleteCampaignPreparedDraft(campaign.id, assigned.id))
      .rejects.toMatchObject({ code: "DRAFT_ALREADY_ASSIGNED", status: 409 });
    await expect(updateCampaignPreparedDraft(campaign.id, assigned.id, {
      text: "배정된 원고를 수정하려는 충분한 길이의 테스트 문장입니다.",
      adminId: `admin-${uniq()}`,
    })).rejects.toMatchObject({ code: "DRAFT_ALREADY_ASSIGNED", status: 409 });
  });

  it("rejects a v2 model response that cites an unknown evidence card", async () => {
    const { reviewer, campaign, receipt } = await createAssignment({
      googlePlace: true,
      googleReview: true,
      blogReference: true,
    });
    await prisma.campaignDraftEvidence.create({
      data: {
        campaignId: campaign.id,
        facet: "SPACE",
        fact: "공간 구성이 구역별로 안내되어 있다",
        sourceType: "ADMIN_APPROVED",
        sourceRef: "approved-runtime-source",
        sourceExcerpt: "공간 구성 안내",
        status: "APPROVED",
      },
    });
    process.env.REVIEW_DRAFT_V2_ENABLED = "true";
    process.env.REVIEW_DRAFT_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-api-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    reviewText: "공간 구성이 구역별로 안내되어 있어 필요한 내용을 방문 전에 차분히 확인하기 좋아 보여요. 관련 정보도 함께 살펴볼 수 있습니다.",
                    styleId: "v2-01-plain-point_first",
                    evidenceIds: ["evidence-from-another-campaign"],
                    promptVersion: "review-diversity-v6",
                  }),
                }],
              },
            }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id),
    ).rejects.toMatchObject({
      code: "UNKNOWN_DRAFT_EVIDENCE",
      status: 422,
    });
  });

  it("rejects a v2 model response that omits its required guide keyword", async () => {
    const { reviewer, campaign, receipt } = await createAssignment({
      googlePlace: true,
      googleReview: true,
      blogReference: true,
    });
    await prisma.campaignDraftGuidance.create({
      data: {
        campaignId: campaign.id,
        guideKeywordsJson: JSON.stringify(["필수 공간 키워드"]),
      },
    });
    const evidence = await prisma.campaignDraftEvidence.create({
      data: {
        campaignId: campaign.id,
        facet: "SPACE",
        fact: "공간 구성이 구역별로 안내되어 있다",
        sourceType: "ADMIN_APPROVED",
        sourceRef: "required-keyword-runtime-source",
        sourceExcerpt: "공간 구성 안내",
        status: "APPROVED",
      },
    });
    process.env.REVIEW_DRAFT_V2_ENABLED = "true";
    process.env.REVIEW_DRAFT_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-gemini-api-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    reviewText: "공간 구성이 구역별로 안내되어 있어 필요한 내용을 방문 전에 차분히 확인하기 좋아 보여요. 관련 정보도 함께 살펴볼 수 있습니다.",
                    styleId: "v2-01-plain-point_first",
                    evidenceIds: [evidence.id],
                    promptVersion: "review-diversity-v6",
                  }),
                }],
              },
            }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      generateCampaignReviewDraftForAssignment(reviewer.id, receipt.id),
    ).rejects.toMatchObject({
      code: "MISSING_REQUIRED_GUIDE_KEYWORD",
      status: 422,
    });
  });
});
