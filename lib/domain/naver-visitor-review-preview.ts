const NAVER_VISITOR_REVIEW_HOSTS = [
  "map.naver.com",
  "place.naver.com",
  "m.place.naver.com",
  "pcmap.place.naver.com",
];

const MAX_PREVIEWS = 10;
const MAX_AUTHOR_LENGTH = 80;
const MAX_CONTENT_LENGTH = 2000;
const MAX_KEYWORDS = 10;
const MAX_KEYWORD_LENGTH = 60;

export const NAVER_VISITOR_REVIEW_RUN_STATUSES = [
  "RUNNING",
  "SUCCESS",
  "NO_REVIEWS",
  "INVALID_INPUT",
  "BLOCKED",
  "CAPTCHA_REQUIRED",
  "PAGE_CHANGED",
  "TIMEOUT",
  "FAILED",
] as const;

export type NaverVisitorReviewRunStatus = (typeof NAVER_VISITOR_REVIEW_RUN_STATUSES)[number];

export class NaverVisitorReviewPreviewError extends Error {
  constructor(
    public readonly code: "NAVER_PLACE_INPUT_INVALID" | "NAVER_PLACE_HOST_UNSUPPORTED",
    message: string,
  ) {
    super(message);
    this.name = "NaverVisitorReviewPreviewError";
  }
}

export interface ParsedNaverVisitorReviewInput {
  placeId: string;
  sourceUrl: string;
  visitorReviewUrl: string;
}

export interface NaverVisitorReviewPreviewInput {
  authorMasked?: unknown;
  content?: unknown;
  rating?: unknown;
  visitDate?: unknown;
  verificationMethod?: unknown;
  keywords?: unknown;
  hasMedia?: unknown;
}

export interface NaverVisitorReviewPreview {
  ordinal: number;
  authorMasked: string | null;
  content: string;
  rating: number | null;
  visitDate: string | null;
  verificationMethod: string | null;
  keywords: string[];
  hasMedia: boolean;
}

function isAllowedNaverHost(hostname: string) {
  const host = hostname.toLowerCase();
  return NAVER_VISITOR_REVIEW_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
}

function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function placeIdFromUrl(url: URL) {
  const pathId = url.pathname.match(/\/(?:place|restaurant)\/(\d+)(?:\/|$)/)?.[1];
  if (pathId) return pathId;
  for (const key of ["id", "placeId", "pinId"]) {
    const value = url.searchParams.get(key);
    if (value && /^\d{1,20}$/.test(value)) return value;
  }
  return null;
}

export function naverVisitorReviewUrl(placeId: string) {
  return `https://pcmap.place.naver.com/restaurant/${placeId}/review/visitor`;
}

export function parseNaverVisitorReviewInput(rawInput: string): ParsedNaverVisitorReviewInput {
  const raw = rawInput.trim();
  if (/^\d{1,20}$/.test(raw)) {
    return {
      placeId: raw,
      sourceUrl: `https://map.naver.com/p/entry/place/${raw}`,
      visitorReviewUrl: naverVisitorReviewUrl(raw),
    };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NaverVisitorReviewPreviewError("NAVER_PLACE_INPUT_INVALID", "NAVER_PLACE_INPUT_INVALID");
  }
  if (url.protocol !== "https:" || !isAllowedNaverHost(url.hostname)) {
    throw new NaverVisitorReviewPreviewError("NAVER_PLACE_HOST_UNSUPPORTED", "NAVER_PLACE_HOST_UNSUPPORTED");
  }
  const placeId = placeIdFromUrl(url);
  if (!placeId) throw new NaverVisitorReviewPreviewError("NAVER_PLACE_INPUT_INVALID", "NAVER_PLACE_INPUT_INVALID");

  return {
    placeId,
    sourceUrl: url.toString(),
    visitorReviewUrl: naverVisitorReviewUrl(placeId),
  };
}

export function normalizeNaverVisitorReviewPreviews(
  cards: NaverVisitorReviewPreviewInput[],
): NaverVisitorReviewPreview[] {
  const previews: NaverVisitorReviewPreview[] = [];
  for (const card of cards) {
    if (previews.length >= MAX_PREVIEWS) break;
    const content = cleanText(card.content, MAX_CONTENT_LENGTH);
    if (!content) continue;
    const rating = typeof card.rating === "number" && Number.isInteger(card.rating) && card.rating >= 1 && card.rating <= 5
      ? card.rating
      : null;
    const keywords = Array.isArray(card.keywords)
      ? card.keywords.map((keyword) => cleanText(keyword, MAX_KEYWORD_LENGTH)).filter(Boolean).slice(0, MAX_KEYWORDS)
      : [];
    previews.push({
      ordinal: previews.length + 1,
      authorMasked: cleanText(card.authorMasked, MAX_AUTHOR_LENGTH) || null,
      content,
      rating,
      visitDate: cleanText(card.visitDate, 80) || null,
      verificationMethod: cleanText(card.verificationMethod, 80) || null,
      keywords,
      hasMedia: card.hasMedia === true,
    });
  }
  return previews;
}
