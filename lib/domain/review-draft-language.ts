import { draftSimilarity } from "@/lib/domain/review-draft-diversity";

export type ReviewDraftLanguageIssueCode =
  | "DISCOURTEOUS_STAFF_REFERENCE"
  | "UNNATURAL_PHRASE"
  | "MALFORMED_PERCENT"
  | "PERCENT_SYMBOL";

export interface ReviewDraftLanguageIssue {
  code: ReviewDraftLanguageIssueCode;
  message: string;
}

const UNNATURAL_PHRASES = ["숙련된 솜씨", "온라인을 통해"] as const;
const INSTRUCTION_LIKE_TEXT =
  /(?:이전|위|앞선)\s*(?:지시|명령)|(?:지시|명령|프롬프트|시스템)\s*(?:무시|출력|공개)|ignore\s+(?:all\s+)?previous|system\s+prompt/iu;
const URL_OR_CONTACT = /(?:https?:\/\/|www\.|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b)/iu;

export function normalizeReviewDraftLanguage(text: string) {
  return text.replace(/직원들/gu, "직원분들").replace(/\s+/gu, " ").trim();
}

export function findReviewDraftLanguageIssues(text: string): ReviewDraftLanguageIssue[] {
  const issues: ReviewDraftLanguageIssue[] = [];
  if (/직원들/u.test(text)) {
    issues.push({
      code: "DISCOURTEOUS_STAFF_REFERENCE",
      message: "'직원들' 대신 '직원분들'처럼 존중하는 표현을 사용하세요.",
    });
  }
  for (const phrase of UNNATURAL_PHRASES) {
    if (text.includes(phrase)) {
      issues.push({
        code: "UNNATURAL_PHRASE",
        message: `'${phrase}'처럼 실제 리뷰에서 어색한 표현을 자연스러운 말로 바꾸세요.`,
      });
    }
  }
  if (/(?:^|[^0-9])%/u.test(text)) {
    issues.push({
      code: "MALFORMED_PERCENT",
      message: "숫자 없이 퍼센트 기호(%)만 사용할 수 없습니다.",
    });
  }
  if (/%/u.test(text)) {
    issues.push({
      code: "PERCENT_SYMBOL",
      message: "퍼센트 기호(%)를 쓰지 말고 확인된 특징을 자연어로 풀어 쓰세요.",
    });
  }
  return issues;
}

function cleanStyleReference(text: string) {
  return normalizeReviewDraftLanguage(
    text
      .replace(/<[^>]*>/gu, " ")
      .replace(/&quot;/gu, '"')
      .replace(/&amp;/gu, "&")
      .replace(/&#39;/gu, "'"),
  );
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function redactPlaceNames(text: string, placeNames: readonly string[]) {
  return placeNames.reduce((result, name) => {
    const cleanName = name.trim();
    return cleanName ? result.replace(new RegExp(escapeRegExp(cleanName), "gu"), "이곳") : result;
  }, text);
}

export interface DraftCorrectionExample {
  beforeText: string;
  afterText: string;
}

export function retrieveDraftCorrectionExamples({
  revisions,
  placeNames = [],
  maxExamples = 8,
}: {
  revisions: readonly DraftCorrectionExample[];
  placeNames?: readonly string[];
  maxExamples?: number;
}) {
  const limit = Math.min(8, Math.max(0, Math.floor(maxExamples)));
  const selected: DraftCorrectionExample[] = [];
  const seen = new Set<string>();

  for (const revision of revisions) {
    const beforeText = redactPlaceNames(cleanStyleReference(revision.beforeText), placeNames);
    const afterText = redactPlaceNames(cleanStyleReference(revision.afterText), placeNames);
    const beforeLength = beforeText.replace(/\s/gu, "").length;
    const afterLength = afterText.replace(/\s/gu, "").length;
    const key = `${beforeText}\u0000${afterText}`;
    if (
      beforeLength < 10 ||
      beforeLength > 200 ||
      afterLength < 20 ||
      afterLength > 200 ||
      beforeText === afterText ||
      seen.has(key) ||
      URL_OR_CONTACT.test(beforeText) ||
      URL_OR_CONTACT.test(afterText) ||
      INSTRUCTION_LIKE_TEXT.test(beforeText) ||
      INSTRUCTION_LIKE_TEXT.test(afterText) ||
      findReviewDraftLanguageIssues(afterText).length > 0
    ) {
      continue;
    }
    seen.add(key);
    selected.push({ beforeText, afterText });
    if (selected.length >= limit) break;
  }
  return selected;
}

function bigrams(text: string) {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]/gu, "");
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function relevanceScore(text: string, queryTexts: readonly string[]) {
  const reviewGrams = bigrams(text);
  if (!reviewGrams.size) return 0;
  const queryGrams = bigrams(queryTexts.join(" "));
  let overlap = 0;
  for (const gram of reviewGrams) if (queryGrams.has(gram)) overlap += 1;
  return overlap / reviewGrams.size;
}

export function retrieveReviewStyleExamples({
  reviews,
  queryTexts,
  placeNames = [],
  maxExamples = 5,
}: {
  reviews: readonly string[];
  queryTexts: readonly string[];
  placeNames?: readonly string[];
  maxExamples?: number;
}) {
  const limit = Math.min(5, Math.max(0, Math.floor(maxExamples)));
  const candidates = reviews
    .map((review, index) => ({ index, text: cleanStyleReference(review) }))
    .filter(({ text }) => {
      const length = text.replace(/\s/gu, "").length;
      return (
        length >= 20 &&
        length <= 180 &&
        !URL_OR_CONTACT.test(text) &&
        !INSTRUCTION_LIKE_TEXT.test(text) &&
        findReviewDraftLanguageIssues(text).length === 0
      );
    })
    .map((candidate) => ({
      ...candidate,
      score: relevanceScore(candidate.text, queryTexts),
      text: redactPlaceNames(candidate.text, placeNames),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selected: string[] = [];
  for (const candidate of candidates) {
    if (selected.some((example) => draftSimilarity(example, candidate.text) >= 0.72)) continue;
    selected.push(candidate.text);
    if (selected.length >= limit) break;
  }
  return selected;
}
