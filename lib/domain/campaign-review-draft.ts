import { createHash } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { retryExternalOperation } from "@/lib/resilience";

export const REVIEW_DRAFT_MIN_SOURCE_GROUPS = 2;
export const REVIEW_DRAFT_MAX_REGENERATIONS = 3;
export const DEFAULT_REVIEW_DRAFT_MODEL = "gemini-2.5-flash";
export const CAMPAIGN_REVIEW_DRAFT_INDUSTRIES = [
  "FOOD_CAFE",
  "BEAUTY_CLINIC",
  "MEDICAL",
  "RETAIL",
  "ACTIVITY",
  "LODGING",
  "OTHER",
] as const;

const REVIEWER_ASSIGNMENT_SOURCE = "CAMPAIGN_ASSIGNMENT";
const REVIEWER_ASSIGNMENT_STATUS_ASSIGNED = "ASSIGNED";
const REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED = "REVIEW_SUBMITTED";
const REVIEWER_ASSIGNMENT_STATUS_COMPLETED = "COMPLETED";
const REVIEWER_ASSIGNMENT_STATUS_REJECTED = "REJECTED";

export type CampaignReviewDraftSourceGroupKey =
  | "GOOGLE_PLACE"
  | "GOOGLE_REVIEWS"
  | "NAVER_PLACE"
  | "NAVER_REFERENCES";

export type CampaignReviewDraftIndustry = (typeof CAMPAIGN_REVIEW_DRAFT_INDUSTRIES)[number];

export interface CampaignDraftGuidance {
  industry: CampaignReviewDraftIndustry | null;
  approvedFacts: string[];
  bannedTerms: string[];
  guideKeywords: string[];
  reviewExamples: string[];
}

export interface CampaignReviewDraftSourceSummary {
  sourceGroupCount: number;
  canGenerateReviewDraft: boolean;
  reviewReferenceCount: number;
  substantiveSourceCount: number;
  approvedFactCount: number;
  industry: CampaignReviewDraftIndustry;
  sourceGroups: {
    googlePlace: boolean;
    googleReviews: boolean;
    naverPlace: boolean;
    naverReferences: boolean;
  };
}

export interface CampaignReviewDraftResult {
  assignmentId: string;
  text: string;
  provider: string;
  model: string;
  sourceGroups: Array<{ key: CampaignReviewDraftSourceGroupKey; label: string; count: number }>;
  sourceGroupCount: number;
  version: number;
  generatedAt: string;
  reused: boolean;
}

export interface CampaignReviewDraftPreview {
  campaignId: string;
  text: string;
  provider: string;
  model: string;
  sourceGroups: Array<{ key: CampaignReviewDraftSourceGroupKey; label: string; count: number }>;
  sourceGroupCount: number;
  generatedAt: string;
}

export class CampaignReviewDraftError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type DbClient = PrismaClient | Prisma.TransactionClient;

type SourceGroup = {
  key: CampaignReviewDraftSourceGroupKey;
  label: string;
  count: number;
  items: string[];
};

type DraftContext = {
  assignmentId: string;
  campaignId: string;
  businessId: string;
  businessName: string;
  address: string | null;
  category: string | null;
  industry: CampaignReviewDraftIndustry;
  guidance: CampaignDraftGuidance;
  menus: string[];
  sourceGroups: SourceGroup[];
  substantiveSourceCount: number;
  contextHash: string;
};

type AssignmentWithContext = NonNullable<Awaited<ReturnType<typeof fetchAssignmentWithContext>>>;
type CampaignWithContext = NonNullable<Awaited<ReturnType<typeof fetchCampaignWithContext>>>;

function envValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function nonSpaceLength(text: string) {
  return text.replace(/\s/g, "").length;
}

function compactWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function stripHtml(text: string | null | undefined) {
  return compactWhitespace(
    (text ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'"),
  );
}

function truncate(text: string, max = 220) {
  const value = stripHtml(text);
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}...`;
}

function uniqueStrings(values: Array<string | null | undefined>, max = 8) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = stripHtml(value);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
    if (result.length >= max) break;
  }
  return result;
}

function sourceGroupMeta(groups: SourceGroup[]) {
  return groups.map((group) => ({
    key: group.key,
    label: group.label,
    count: group.count,
  }));
}

function contextHash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function normalizeGeneratedDraft(text: string) {
  return compactWhitespace(
    text
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/^\s*[\d\-*.)]+\s*/g, "")
      .replace(/\s*\n+\s*/g, " "),
  );
}

function limitSentenceCount(text: string, maxSentences = 3) {
  let sentenceCount = 0;
  for (const match of text.matchAll(/[.!?\u2026\u3002\uFF01\uFF1F]+/gu)) {
    sentenceCount += 1;
    if (sentenceCount === maxSentences) {
      return text.slice(0, (match.index ?? 0) + match[0].length).trim();
    }
  }
  return text;
}

function ensureTerminalPunctuation(text: string, maxNonSpace: number) {
  const trimmed = text.trim();
  if (!trimmed || /[.!?\u2026\u3002\uFF01\uFF1F]$/u.test(trimmed)) return trimmed;
  if (nonSpaceLength(trimmed) < maxNonSpace) return `${trimmed}.`;

  const chars = Array.from(trimmed);
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    if (!/\s/u.test(chars[index])) {
      chars[index] = ".";
      return chars.join("");
    }
  }
  return trimmed;
}

function clampToNonSpaceLimit(text: string, maxNonSpace = 200) {
  let result = "";
  let count = 0;
  for (const char of text) {
    const adds = /\s/.test(char) ? 0 : 1;
    if (count + adds > maxNonSpace) break;
    result += char;
    count += adds;
  }
  return ensureTerminalPunctuation(result, maxNonSpace);
}

function defaultForbiddenTerms(industry: CampaignReviewDraftIndustry) {
  if (industry === "BEAUTY_CLINIC" || industry === "MEDICAL") {
    return [
      "메뉴",
      "음식",
      "맛있",
      "식사",
      "카페",
      "레스토랑",
      "술집",
      "외식",
      "데이트",
      "함께 즐기기",
      "매장 분위기",
      "치료 효과",
      "효과가",
      "완치",
      "개선",
      "보장",
      "부작용 없음",
      "통증 없음",
    ];
  }
  if (industry === "FOOD_CAFE") {
    return ["시술", "진료", "치료", "처방", "회복", "효과 보장"];
  }
  return [];
}

function normalizedForTermCheck(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

function validateGeneratedDraft(text: string, context: DraftContext) {
  const matchedTerm = [...defaultForbiddenTerms(context.industry), ...context.guidance.bannedTerms].find((term) => {
    const normalizedTerm = normalizedForTermCheck(term);
    return normalizedTerm.length > 0 && normalizedForTermCheck(text).includes(normalizedTerm);
  });
  if (matchedTerm) {
    throw new CampaignReviewDraftError(
      "UNSUITABLE_GENERATED_DRAFT",
      "업종과 맞지 않거나 운영자가 제한한 표현이 포함되어 원고를 생성하지 않았습니다.",
      422,
    );
  }
  return text;
}

function neutralFallbackDraft(context: DraftContext) {
  const approvedFact = context.guidance.approvedFacts[0];
  const guideKeyword = context.guidance.guideKeywords[0];
  const industryLabel = campaignReviewDraftIndustryLabel(context.industry);
  const factLine = approvedFact
    ? `${approvedFact} 관련 정보를 확인하고 방문했어요.`
    : guideKeyword
      ? `${guideKeyword} 정보를 참고해 방문했어요.`
    : `${industryLabel} 정보를 확인한 뒤 방문했어요.`;
  return `${context.businessName}은 ${factLine} 실제 이용 경험에 맞는 내용을 더해 자연스럽게 후기를 남기고 싶은 곳입니다.`;
}

function ensureDraftLength(text: string, context: DraftContext) {
  let draft = limitSentenceCount(normalizeGeneratedDraft(text));
  if (nonSpaceLength(draft) < 30) {
    draft = neutralFallbackDraft(context);
  }
  if (nonSpaceLength(draft) > 200) {
    draft = clampToNonSpaceLimit(draft, 200);
  }
  draft = ensureTerminalPunctuation(draft, 200);
  const length = nonSpaceLength(draft);
  if (length < 30 || length > 200) {
    throw new CampaignReviewDraftError(
      "INVALID_GENERATED_DRAFT",
      "생성된 원고 길이가 기준에 맞지 않습니다.",
      500,
    );
  }
  return validateGeneratedDraft(draft, context);
}

function placeLine(place: {
  name: string;
  address: string | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
}) {
  return [
    place.name,
    place.category ? `분류: ${place.category}` : null,
    place.address ? `주소: ${place.address}` : null,
    place.rating ? `평점: ${place.rating}` : null,
    place.reviewCount ? `리뷰수: ${place.reviewCount}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

async function fetchAssignmentWithContext(db: DbClient, assignmentId: string) {
  return db.receipt.findUnique({
    where: { id: assignmentId },
    include: {
      campaign: {
        include: {
          draftGuidance: true,
          blogReferences: {
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
            take: 12,
          },
        },
      },
      business: {
        include: {
          menus: { take: 12 },
          externalPlaces: {
            where: { platform: { in: ["GOOGLE", "NAVER"] } },
          },
          externalReviews: {
            where: { content: { not: null } },
            orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
            take: 20,
          },
        },
      },
    },
  });
}

async function fetchCampaignWithContext(db: DbClient, campaignId: string) {
  return db.campaign.findUnique({
    where: { id: campaignId },
    include: {
      draftGuidance: true,
      blogReferences: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
      business: {
        include: {
          menus: { take: 12 },
          externalPlaces: {
            where: { platform: { in: ["GOOGLE", "NAVER"] } },
          },
          externalReviews: {
            where: { content: { not: null } },
            orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
            take: 20,
          },
        },
      },
    },
  });
}

function buildDraftContext(input: {
  assignmentId: string;
  campaignId: string;
  businessId: string;
  campaign: AssignmentWithContext["campaign"] | CampaignWithContext;
  business: AssignmentWithContext["business"] | CampaignWithContext["business"];
}): DraftContext {
  const googlePlace = input.business.externalPlaces.find((place) => place.platform === "GOOGLE") ?? null;
  const naverPlace = input.business.externalPlaces.find((place) => place.platform === "NAVER") ?? null;
  const googleReviews = input.business.externalReviews.filter(
    (review) => review.platform === "GOOGLE" && stripHtml(review.content),
  );
  const naverReviews = input.business.externalReviews.filter(
    (review) => review.platform === "NAVER" && stripHtml(review.content),
  );
  const blogReferences = input.campaign.blogReferences.filter(
    (reference) => stripHtml(reference.title) || stripHtml(reference.description),
  );

  const sourceGroups: SourceGroup[] = [];
  if (googlePlace) {
    sourceGroups.push({
      key: "GOOGLE_PLACE",
      label: "Google Place 등록정보",
      count: 1,
      items: [placeLine(googlePlace)],
    });
  }
  if (googleReviews.length) {
    sourceGroups.push({
      key: "GOOGLE_REVIEWS",
      label: "Google 리뷰 데이터",
      count: googleReviews.length,
      items: uniqueStrings(googleReviews.map((review) => review.content), 6).map((text) => truncate(text, 180)),
    });
  }
  if (naverPlace) {
    sourceGroups.push({
      key: "NAVER_PLACE",
      label: "Naver SmartPlace 등록정보",
      count: 1,
      items: [placeLine(naverPlace)],
    });
  }
  if (blogReferences.length || naverReviews.length) {
    sourceGroups.push({
      key: "NAVER_REFERENCES",
      label: "Naver 블로그/방문자리뷰 참고 데이터",
      count: blogReferences.length + naverReviews.length,
      items: [
        ...uniqueStrings(
          blogReferences.map((reference) =>
            [reference.title, reference.description].filter(Boolean).join(" - "),
          ),
          6,
        ).map((text) => truncate(text, 180)),
        ...uniqueStrings(naverReviews.map((review) => review.content), 4).map((text) => truncate(text, 180)),
      ].slice(0, 10),
    });
  }

  const businessName = googlePlace?.name ?? naverPlace?.name ?? input.business.name;
  const address = googlePlace?.address ?? naverPlace?.address ?? input.business.address;
  const category = googlePlace?.category ?? naverPlace?.category ?? null;
  const guidance = normalizeCampaignDraftGuidance(input.campaign.draftGuidance);
  const industry = guidance.industry ?? inferCampaignReviewDraftIndustry(category, businessName);
  const menus = uniqueStrings(input.business.menus.map((menu) => menu.name), 10);
  const substantiveSourceCount =
    googleReviews.length +
    naverReviews.length +
    blogReferences.length +
    guidance.approvedFacts.length +
    guidance.guideKeywords.length +
    guidance.reviewExamples.length;
  const hashInput = {
    businessName,
    address,
    category,
    industry,
    guidance,
    menus,
    sourceGroups: sourceGroups.map((group) => ({
      key: group.key,
      count: group.count,
      items: group.items,
    })),
  };

  return {
    assignmentId: input.assignmentId,
    campaignId: input.campaignId,
    businessId: input.businessId,
    businessName,
    address,
    category,
    industry,
    guidance,
    menus,
    sourceGroups,
    substantiveSourceCount,
    contextHash: contextHash(hashInput),
  };
}

export function summarizeCampaignReviewDraftSources(input: {
  googlePlace: unknown | null | undefined;
  googleReviewCount?: number | null;
  naverPlace: unknown | null | undefined;
  naverReferenceCount?: number | null;
  category?: string | null;
  businessName?: string | null;
  industry?: CampaignReviewDraftIndustry | null;
  approvedFactCount?: number | null;
  guideKeywordCount?: number | null;
  reviewExampleCount?: number | null;
}): CampaignReviewDraftSourceSummary {
  const sourceGroups = {
    googlePlace: Boolean(input.googlePlace),
    googleReviews: Boolean(input.googleReviewCount && input.googleReviewCount > 0),
    naverPlace: Boolean(input.naverPlace),
    naverReferences: Boolean(input.naverReferenceCount && input.naverReferenceCount > 0),
  };
  const sourceGroupCount = Object.values(sourceGroups).filter(Boolean).length;
  const reviewReferenceCount = (input.googleReviewCount ?? 0) + (input.naverReferenceCount ?? 0);
  const approvedFactCount = Math.max(0, input.approvedFactCount ?? 0);
  const substantiveSourceCount =
    reviewReferenceCount +
    approvedFactCount +
    Math.max(0, input.guideKeywordCount ?? 0) +
    Math.max(0, input.reviewExampleCount ?? 0);
  const industry = input.industry ?? inferCampaignReviewDraftIndustry(input.category, input.businessName ?? "");
  return {
    sourceGroupCount,
    sourceGroups,
    reviewReferenceCount,
    substantiveSourceCount,
    approvedFactCount,
    industry,
    canGenerateReviewDraft:
      sourceGroupCount >= REVIEW_DRAFT_MIN_SOURCE_GROUPS && substantiveSourceCount > 0,
  };
}

function renderPromptContext(context: DraftContext) {
  const groups = context.sourceGroups
    .map((group) => `- ${group.label} (${group.count}건): ${group.items.join(" | ")}`)
    .join("\n");
  return [
    `매장명: ${context.businessName}`,
    `업종: ${campaignReviewDraftIndustryLabel(context.industry)}${context.category ? ` (${context.category})` : ""}`,
    context.address ? `주소: ${context.address}` : null,
    context.menus.length ? `메뉴 후보: ${context.menus.join(", ")}` : null,
    context.guidance.approvedFacts.length
      ? `관리자 승인 사실: ${context.guidance.approvedFacts.map((fact) => `- ${fact}`).join(" / ")}`
      : null,
    context.guidance.guideKeywords.length
      ? `시트 리뷰작성 가이드 키워드: ${context.guidance.guideKeywords.join(", ")}`
      : null,
    context.guidance.reviewExamples.length
      ? `시트 리뷰 문구 예시(복사하지 말고 참고만 사용): ${context.guidance.reviewExamples.join(" | ")}`
      : null,
    context.guidance.bannedTerms.length ? `관리자 금지 표현: ${context.guidance.bannedTerms.join(", ")}` : null,
    `참고자료:\n${groups}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function templateDraft(context: DraftContext) {
  return ensureDraftLength(neutralFallbackDraft(context), context);
}

async function geminiDraft(context: DraftContext, model: string, apiKey: string) {
  const prompt = [
    "아래 참고자료만 바탕으로 Google 지도 방문 리뷰 원고를 작성하세요.",
    "규칙:",
    "- 한국어 자연스러운 방문 후기체",
    "- 공백 제외 30~200자",
    "- 1~3문장",
    "- 참고자료 또는 관리자 승인 사실에 없는 메뉴, 가격, 효과, 방문 경험을 만들지 말 것",
    "- 업종과 맞지 않는 일반 표현을 쓰지 말 것. 특히 의료·뷰티 업종에는 음식, 메뉴, 식사, 데이트, 매장 분위기 표현 금지",
    "- 의료·뷰티 업종은 치료 효과, 개선 보장, 부작용 없음 같은 결과 보장 표현 금지",
    "- '광고', '협찬', '제공' 같은 표현 금지",
    "- 참고 리뷰/블로그 문구를 그대로 베끼지 말고 재구성",
    "- 원고 텍스트만 출력",
    "",
    renderPromptContext(context),
  ].join("\n");

  const request = async () => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 240,
        },
      }),
      signal: AbortSignal.timeout(12000),
      },
    );

    const data = (await res.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      const error = Object.assign(new Error(data.error?.message ?? `Gemini request failed: ${res.status}`), {
        status: res.status,
      });
      throw error;
    }

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join(" ").trim() ?? "";
    if (!text) throw new Error("Gemini returned empty draft");
    return ensureDraftLength(text, context);
  };

  return retryExternalOperation(request, { attempts: 3, baseDelayMs: 300, maxDelayMs: 1_200 });
}

function normalizeTextList(value: unknown, maxItems: number, maxItemLength: number) {
  const raw = Array.isArray(value) ? value : [];
  return uniqueStrings(
    raw.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, maxItemLength)),
    maxItems,
  );
}

function parseTextList(value: string | null | undefined, maxItems: number, maxItemLength: number) {
  if (!value) return [];
  try {
    return normalizeTextList(JSON.parse(value), maxItems, maxItemLength);
  } catch {
    return [];
  }
}

export function isCampaignReviewDraftIndustry(value: unknown): value is CampaignReviewDraftIndustry {
  return typeof value === "string" && (CAMPAIGN_REVIEW_DRAFT_INDUSTRIES as readonly string[]).includes(value);
}

export function inferCampaignReviewDraftIndustry(
  category: string | null | undefined,
  businessName = "",
): CampaignReviewDraftIndustry {
  const value = `${category ?? ""} ${businessName}`.toLowerCase();
  if (/피부과|성형|미용의원|뷰티|beauty|에스테틱|esthetic|클리닉/.test(value)) return "BEAUTY_CLINIC";
  if (/의원|병원|치과|한의원|약국|검진|medical|clinic/.test(value)) return "MEDICAL";
  if (/음식|식당|레스토랑|카페|커피|베이커리|제과|주점|바|푸드|한식|중식|일식|양식|분식|restaurant|cafe|bakery|bar|pub/.test(value)) {
    return "FOOD_CAFE";
  }
  if (/호텔|숙소|펜션|게스트하우스|hotel|lodging|stay/.test(value)) return "LODGING";
  if (/체험|전시|공방|클래스|공연|여행|activity|workshop/.test(value)) return "ACTIVITY";
  if (/쇼핑|의류|가구|마트|판매|편집샵|retail|store/.test(value)) return "RETAIL";
  return "OTHER";
}

export function campaignReviewDraftIndustryLabel(industry: CampaignReviewDraftIndustry) {
  const labels: Record<CampaignReviewDraftIndustry, string> = {
    FOOD_CAFE: "음식점·카페",
    BEAUTY_CLINIC: "뷰티·의원",
    MEDICAL: "의료기관",
    RETAIL: "판매·소매",
    ACTIVITY: "체험·문화",
    LODGING: "숙박",
    OTHER: "기타 업종",
  };
  return labels[industry];
}

export function normalizeCampaignDraftGuidance(input: {
  industry?: unknown;
  approvedFacts?: unknown;
  approvedFactsJson?: string | null;
  bannedTerms?: unknown;
  bannedTermsJson?: string | null;
  guideKeywords?: unknown;
  guideKeywordsJson?: string | null;
  reviewExamples?: unknown;
  reviewExamplesJson?: string | null;
} | null | undefined): CampaignDraftGuidance {
  const approvedFacts = Array.isArray(input?.approvedFacts)
    ? normalizeTextList(input.approvedFacts, 8, 160)
    : parseTextList(input?.approvedFactsJson, 8, 160);
  const bannedTerms = Array.isArray(input?.bannedTerms)
    ? normalizeTextList(input.bannedTerms, 12, 40)
    : parseTextList(input?.bannedTermsJson, 12, 40);
  const guideKeywords = Array.isArray(input?.guideKeywords)
    ? normalizeTextList(input.guideKeywords, 20, 80)
    : parseTextList(input?.guideKeywordsJson, 20, 80);
  const reviewExamples = Array.isArray(input?.reviewExamples)
    ? normalizeTextList(input.reviewExamples, 10, 240)
    : parseTextList(input?.reviewExamplesJson, 10, 240);
  return {
    industry: isCampaignReviewDraftIndustry(input?.industry) ? input.industry : null,
    approvedFacts,
    bannedTerms,
    guideKeywords,
    reviewExamples,
  };
}

function assertDraftContextReady(context: DraftContext) {
  if (context.sourceGroups.length < REVIEW_DRAFT_MIN_SOURCE_GROUPS) {
    throw new CampaignReviewDraftError(
      "INSUFFICIENT_CONTEXT",
      "원고 생성을 위한 참고자료가 부족합니다. Google/Naver/리뷰/블로그 자료 중 2종 이상이 필요합니다.",
      422,
    );
  }
  if (context.substantiveSourceCount === 0) {
    throw new CampaignReviewDraftError(
      "INSUFFICIENT_QUALITY_CONTEXT",
      "등록정보 외에 실제 후기·블로그 참고자료, 시트 가이드 또는 관리자 승인 사실이 필요합니다.",
      422,
    );
  }
}

export async function generateCampaignReviewDraftPreview(
  campaignId: string,
  db: DbClient = prisma,
): Promise<CampaignReviewDraftPreview> {
  const cleanCampaignId = campaignId.trim();
  if (!cleanCampaignId) {
    throw new CampaignReviewDraftError("INVALID_CAMPAIGN", "캠페인 정보를 확인해 주세요.");
  }

  const campaign = await fetchCampaignWithContext(db, cleanCampaignId);
  if (!campaign) {
    throw new CampaignReviewDraftError("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없습니다.", 404);
  }

  const context = buildDraftContext({
    assignmentId: `admin-preview:${campaign.id}`,
    campaignId: campaign.id,
    businessId: campaign.businessId,
    campaign,
    business: campaign.business,
  });
  assertDraftContextReady(context);
  const generated = await generateDraftText(context);
  const sourceGroups = sourceGroupMeta(context.sourceGroups);
  return {
    campaignId: campaign.id,
    text: generated.text,
    provider: generated.provider,
    model: generated.model,
    sourceGroups,
    sourceGroupCount: sourceGroups.length,
    generatedAt: new Date().toISOString(),
  };
}

async function generateDraftText(context: DraftContext) {
  const provider = envValue("REVIEW_DRAFT_PROVIDER") || "gemini";
  const model = envValue("REVIEW_DRAFT_MODEL") || DEFAULT_REVIEW_DRAFT_MODEL;
  const apiKey = envValue("GEMINI_API_KEY");
  const canUseDevelopmentFallback = process.env.NODE_ENV !== "production";

  if (provider === "template") {
    return { text: templateDraft(context), provider: "template", model: "template-v1" };
  }

  if (provider !== "gemini") {
    throw new CampaignReviewDraftError("UNSUPPORTED_DRAFT_PROVIDER", "지원하지 않는 원고 생성 Provider입니다.", 500);
  }

  if (!apiKey) {
    if (canUseDevelopmentFallback) {
      return { text: templateDraft(context), provider: "template", model: "template-v1" };
    }
    throw new CampaignReviewDraftError("AI_PROVIDER_NOT_CONFIGURED", "원고 생성 AI 키가 설정되지 않았습니다.", 500);
  }

  try {
    return { text: await geminiDraft(context, model, apiKey), provider: "gemini", model };
  } catch (e) {
    if (e instanceof CampaignReviewDraftError) throw e;
    if (canUseDevelopmentFallback) {
      return { text: templateDraft(context), provider: "template", model: "template-v1" };
    }
    throw new CampaignReviewDraftError(
      "AI_GENERATION_FAILED",
      e instanceof Error ? e.message : "원고 생성에 실패했습니다.",
      502,
    );
  }
}

export async function generateCampaignReviewDraftForAssignment(
  reviewerId: string,
  assignmentId: string,
  options: { regenerate?: boolean } = {},
  db: DbClient = prisma,
): Promise<CampaignReviewDraftResult> {
  const cleanAssignmentId = assignmentId.trim();
  if (!cleanAssignmentId) {
    throw new CampaignReviewDraftError("INVALID_ASSIGNMENT", "참여 정보를 확인해 주세요.");
  }

  const receipt = await fetchAssignmentWithContext(db, cleanAssignmentId);
  if (!receipt || receipt.reviewerId !== reviewerId) {
    throw new CampaignReviewDraftError("ASSIGNMENT_NOT_FOUND", "참여 정보를 찾을 수 없습니다.", 404);
  }
  if (receipt.source !== REVIEWER_ASSIGNMENT_SOURCE) {
    throw new CampaignReviewDraftError("INVALID_ASSIGNMENT", "캠페인 참여 기록이 아닙니다.", 422);
  }

  const existingDraft = receipt.reviewDraftText?.trim();
  const existingGeneratedAt = receipt.reviewDraftGeneratedAt ?? receipt.createdAt;
  if (existingDraft && !options.regenerate) {
    const groups = receipt.reviewDraftSourceGroupsJson
      ? (JSON.parse(receipt.reviewDraftSourceGroupsJson) as CampaignReviewDraftResult["sourceGroups"])
      : [];
    return {
      assignmentId: receipt.id,
      text: existingDraft,
      provider: receipt.reviewDraftProvider ?? "unknown",
      model: receipt.reviewDraftModel ?? "unknown",
      sourceGroups: groups,
      sourceGroupCount: groups.length,
      version: receipt.reviewDraftVersion || 1,
      generatedAt: existingGeneratedAt.toISOString(),
      reused: true,
    };
  }

  if (
    [
      REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED,
      REVIEWER_ASSIGNMENT_STATUS_COMPLETED,
      REVIEWER_ASSIGNMENT_STATUS_REJECTED,
    ].includes(receipt.status)
  ) {
    throw new CampaignReviewDraftError("BAD_ASSIGNMENT_STATE", "이미 검수가 진행된 참여건은 원고를 다시 생성할 수 없습니다.", 409);
  }
  if (receipt.status !== REVIEWER_ASSIGNMENT_STATUS_ASSIGNED && receipt.status !== "VERIFIED") {
    throw new CampaignReviewDraftError("BAD_ASSIGNMENT_STATE", "원고를 생성할 수 없는 참여 상태입니다.", 409);
  }
  if (receipt.reviewDraftVersion >= REVIEW_DRAFT_MAX_REGENERATIONS) {
    throw new CampaignReviewDraftError("REGENERATION_LIMIT_EXCEEDED", "원고 재생성은 최대 3회까지만 가능합니다.", 429);
  }

  const context = buildDraftContext({
    assignmentId: receipt.id,
    campaignId: receipt.campaignId,
    businessId: receipt.businessId,
    campaign: receipt.campaign,
    business: receipt.business,
  });
  assertDraftContextReady(context);

  const generated = await generateDraftText(context);
  const generatedAt = new Date();
  const sourceGroups = sourceGroupMeta(context.sourceGroups);
  const version = receipt.reviewDraftVersion + 1;
  await db.receipt.update({
    where: { id: receipt.id },
    data: {
      reviewDraftText: generated.text,
      reviewDraftProvider: generated.provider,
      reviewDraftModel: generated.model,
      reviewDraftSourceGroupsJson: JSON.stringify(sourceGroups),
      reviewDraftContextHash: context.contextHash,
      reviewDraftGeneratedAt: generatedAt,
      reviewDraftVersion: version,
    },
  });

  return {
    assignmentId: receipt.id,
    text: generated.text,
    provider: generated.provider,
    model: generated.model,
    sourceGroups,
    sourceGroupCount: sourceGroups.length,
    version,
    generatedAt: generatedAt.toISOString(),
    reused: false,
  };
}
