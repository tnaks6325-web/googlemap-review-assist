import { createHash } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { retryExternalOperation } from "@/lib/resilience";

export const REVIEW_DRAFT_MIN_SOURCE_GROUPS = 2;
export const REVIEW_DRAFT_MAX_REGENERATIONS = 3;
export const DEFAULT_REVIEW_DRAFT_MODEL = "gemini-2.5-flash";

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

export interface CampaignReviewDraftSourceSummary {
  sourceGroupCount: number;
  canGenerateReviewDraft: boolean;
  reviewReferenceCount: number;
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
  menus: string[];
  sourceGroups: SourceGroup[];
  contextHash: string;
};

type AssignmentWithContext = NonNullable<Awaited<ReturnType<typeof fetchAssignmentWithContext>>>;

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

function ensureDraftLength(text: string, context: DraftContext) {
  let draft = limitSentenceCount(normalizeGeneratedDraft(text));
  if (nonSpaceLength(draft) < 30) {
    const menuHint = context.menus[0] ? `${context.menus[0]} 같은 메뉴와 ` : "";
    draft = `${context.businessName}은 ${menuHint}매장 분위기를 함께 즐기기 좋은 곳이에요. 다음에도 편하게 찾고 싶은 방문 후기였습니다.`;
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
  return draft;
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

function buildDraftContext(receipt: AssignmentWithContext): DraftContext {
  const googlePlace = receipt.business.externalPlaces.find((place) => place.platform === "GOOGLE") ?? null;
  const naverPlace = receipt.business.externalPlaces.find((place) => place.platform === "NAVER") ?? null;
  const googleReviews = receipt.business.externalReviews.filter(
    (review) => review.platform === "GOOGLE" && stripHtml(review.content),
  );
  const naverReviews = receipt.business.externalReviews.filter(
    (review) => review.platform === "NAVER" && stripHtml(review.content),
  );
  const blogReferences = receipt.campaign.blogReferences.filter(
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

  const businessName = googlePlace?.name ?? naverPlace?.name ?? receipt.business.name;
  const address = googlePlace?.address ?? naverPlace?.address ?? receipt.business.address;
  const category = googlePlace?.category ?? naverPlace?.category ?? null;
  const menus = uniqueStrings(receipt.business.menus.map((menu) => menu.name), 10);
  const hashInput = {
    businessName,
    address,
    category,
    menus,
    sourceGroups: sourceGroups.map((group) => ({
      key: group.key,
      count: group.count,
      items: group.items,
    })),
  };

  return {
    assignmentId: receipt.id,
    campaignId: receipt.campaignId,
    businessId: receipt.businessId,
    businessName,
    address,
    category,
    menus,
    sourceGroups,
    contextHash: contextHash(hashInput),
  };
}

export function summarizeCampaignReviewDraftSources(input: {
  googlePlace: unknown | null | undefined;
  googleReviewCount?: number | null;
  naverPlace: unknown | null | undefined;
  naverReferenceCount?: number | null;
}): CampaignReviewDraftSourceSummary {
  const sourceGroups = {
    googlePlace: Boolean(input.googlePlace),
    googleReviews: Boolean(input.googleReviewCount && input.googleReviewCount > 0),
    naverPlace: Boolean(input.naverPlace),
    naverReferences: Boolean(input.naverReferenceCount && input.naverReferenceCount > 0),
  };
  const sourceGroupCount = Object.values(sourceGroups).filter(Boolean).length;
  return {
    sourceGroupCount,
    sourceGroups,
    reviewReferenceCount: (input.googleReviewCount ?? 0) + (input.naverReferenceCount ?? 0),
    canGenerateReviewDraft: sourceGroupCount >= REVIEW_DRAFT_MIN_SOURCE_GROUPS,
  };
}

function renderPromptContext(context: DraftContext) {
  const groups = context.sourceGroups
    .map((group) => `- ${group.label} (${group.count}건): ${group.items.join(" | ")}`)
    .join("\n");
  return [
    `매장명: ${context.businessName}`,
    context.category ? `업종: ${context.category}` : null,
    context.address ? `주소: ${context.address}` : null,
    context.menus.length ? `메뉴 후보: ${context.menus.join(", ")}` : null,
    `참고자료:\n${groups}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function templateDraft(context: DraftContext) {
  const category = context.category ? `${context.category} 매장` : "매장";
  const menuPart = context.menus.length
    ? `${context.menus.slice(0, 2).join(", ")} 같은 메뉴를`
    : "메뉴를";
  const addressPart = context.address ? "근처에서 " : "";
  return ensureDraftLength(
    `${context.businessName}은 ${addressPart}${menuPart} 편하게 즐기기 좋은 ${category}이에요. 참고한 후기처럼 분위기와 이용 경험이 좋아 재방문하고 싶은 곳입니다.`,
    context,
  );
}

async function geminiDraft(context: DraftContext, model: string, apiKey: string) {
  const prompt = [
    "아래 참고자료만 바탕으로 Google 지도 방문 리뷰 원고를 작성하세요.",
    "규칙:",
    "- 한국어 자연스러운 방문 후기체",
    "- 공백 제외 30~200자",
    "- 1~3문장",
    "- 과장, 허위 메뉴/가격/방문 경험 금지",
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

  const context = buildDraftContext(receipt);
  if (context.sourceGroups.length < REVIEW_DRAFT_MIN_SOURCE_GROUPS) {
    throw new CampaignReviewDraftError(
      "INSUFFICIENT_CONTEXT",
      "원고 생성을 위한 참고자료가 부족합니다. Google/Naver/리뷰/블로그 자료 중 2종 이상이 필요합니다.",
      422,
    );
  }

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
