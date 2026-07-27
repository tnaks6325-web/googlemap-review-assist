import { getOcrProvider } from "@/lib/ocr";

export type ReviewProofAnalysisStatus = "AUTO_APPROVE" | "AUTO_REJECT" | "MANUAL_REVIEW" | "UNAVAILABLE";
export type ReviewProofCheckStatus = "PASS" | "FAIL" | "UNKNOWN";

export interface ReviewProofAnalysis {
  status: ReviewProofAnalysisStatus;
  provider: string;
  extractedText: string;
  similarity: number;
  reason: string;
  confidence: number;
  checks?: {
    placeName: ReviewProofCheckStatus;
    rating: ReviewProofCheckStatus;
    recency: ReviewProofCheckStatus;
  };
}

export interface ReviewProofAnalysisInput {
  draftText: string;
  imageBytes?: Uint8Array;
  mimeType?: string;
  mockText?: string;
  expectedPlaceName?: string;
  maxReviewAgeDays?: number;
}

const DEFAULT_AUTO_APPROVE_THRESHOLD = 0.8;
const DEFAULT_AUTO_REJECT_THRESHOLD = 0.18;
const DEFAULT_MAX_REVIEW_AGE_DAYS = 7;
const MIN_TRUNCATED_PLACE_NAME_LENGTH = 8;
const MAX_TRUNCATED_PLACE_NAME_CHARS = 3;
const MIN_TRUNCATED_PLACE_NAME_RATIO = 0.7;
const READ_MORE_PATTERN = /더\s*보기|more/iu;
const VISIBLE_TEXT_BEFORE_READ_MORE_CHARS = 600;
const DRAFT_PREFIX_COMPACT_LENGTHS = [40, 70, 100, 130];
const NON_FIVE_CATEGORY_SCORE_PATTERN = /(?:음식|서비스|분위기)\s*:\s*[0-4]\s*\/\s*5/u;
const FIVE_CATEGORY_SCORE_PATTERN = /(?:음식|서비스|분위기)\s*:\s*5\s*\/\s*5/u;
const NON_FIVE_STAR_PATTERN = /(?:별점|평점)\s*[0-4]\s*(?:개|점)/u;
const FIVE_STAR_PATTERN = /(?:별점|평점)\s*5\s*(?:개|점)/u;

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeReviewText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(text: string) {
  return normalizeReviewText(text).replace(/\s+/g, "");
}

function placeNameAliases(placeName: string) {
  const aliases = new Set<string>();
  for (const part of placeName.split(/[|/·]/)) {
    const value = compact(part);
    if (value.length >= 2) aliases.add(value);
  }
  const full = compact(placeName);
  if (full.length >= 2) aliases.add(full);
  return Array.from(aliases);
}

function matchesPlaceNameAlias(candidate: string, alias: string) {
  if (candidate.includes(alias)) return true;

  const minimumPrefixLength = Math.max(
    MIN_TRUNCATED_PLACE_NAME_LENGTH,
    alias.length - MAX_TRUNCATED_PLACE_NAME_CHARS,
    Math.ceil(alias.length * MIN_TRUNCATED_PLACE_NAME_RATIO),
  );

  if (minimumPrefixLength >= alias.length) return false;

  for (let length = alias.length - 1; length >= minimumPrefixLength; length -= 1) {
    if (candidate.includes(alias.slice(0, length))) return true;
  }

  return false;
}

function ngrams(text: string, n = 2) {
  const value = compact(text);
  if (!value) return [];
  if (value.length <= n) return [value];
  const result: string[] = [];
  for (let i = 0; i <= value.length - n; i += 1) {
    result.push(value.slice(i, i + n));
  }
  return result;
}

function countMap(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function diceCoefficient(a: string, b: string) {
  const aGrams = ngrams(a);
  const bGrams = ngrams(b);
  if (!aGrams.length || !bGrams.length) return 0;

  const aCounts = countMap(aGrams);
  const bCounts = countMap(bGrams);
  let overlap = 0;
  for (const [gram, count] of aCounts) {
    overlap += Math.min(count, bCounts.get(gram) ?? 0);
  }
  return (2 * overlap) / (aGrams.length + bGrams.length);
}

function draftCoverage(draftText: string, extractedText: string) {
  const draftGrams = ngrams(draftText);
  const extracted = new Set(ngrams(extractedText));
  if (!draftGrams.length || !extracted.size) return 0;
  const matched = draftGrams.filter((gram) => extracted.has(gram)).length;
  return matched / draftGrams.length;
}

function baseReviewProofSimilarity(draftText: string, extractedText: string) {
  const draft = compact(draftText);
  const extracted = compact(extractedText);
  if (!draft || !extracted) return 0;
  if (extracted.includes(draft)) return 1;
  return Math.max(diceCoefficient(draftText, extractedText), draftCoverage(draftText, extractedText));
}

function visibleTextsBeforeReadMore(extractedText: string) {
  const windows: string[] = [];
  const matcher = new RegExp(READ_MORE_PATTERN.source, READ_MORE_PATTERN.flags.includes("g") ? READ_MORE_PATTERN.flags : `${READ_MORE_PATTERN.flags}g`);
  for (const match of extractedText.matchAll(matcher)) {
    windows.push(
      extractedText.slice(
        Math.max(0, match.index - VISIBLE_TEXT_BEFORE_READ_MORE_CHARS),
        match.index,
      ),
    );
  }
  return windows;
}

function prefixByCompactLength(text: string, maxCompactLength: number) {
  const normalized = normalizeReviewText(text);
  let result = "";
  let currentLength = 0;

  for (const char of normalized) {
    result += char;
    currentLength += compact(char).length;
    if (currentLength >= maxCompactLength) break;
  }

  return result.trim();
}

function visibleDraftPrefixSimilarity(draftText: string, visibleExtractedText: string) {
  const draftLength = compact(draftText).length;
  const visibleLength = compact(visibleExtractedText).length;
  if (draftLength < 10 || visibleLength < 10) return 0;

  return Math.max(
    ...DRAFT_PREFIX_COMPACT_LENGTHS.filter((length) => draftLength >= Math.min(length, 20)).map((length) =>
      baseReviewProofSimilarity(prefixByCompactLength(draftText, Math.min(length, draftLength)), visibleExtractedText),
    ),
  );
}

function reviewProofCandidates(draftText: string, extractedText: string) {
  const visibleWindows = visibleTextsBeforeReadMore(extractedText);
  const windows = visibleWindows.length ? visibleWindows : [extractedText];

  return windows.map((visibleText) => ({
    text: visibleText,
    similarity: Math.max(
        baseReviewProofSimilarity(draftText, visibleText),
        visibleDraftPrefixSimilarity(draftText, visibleText),
    ),
  }));
}

function bestReviewProofCandidate(draftText: string, extractedText: string) {
  return reviewProofCandidates(draftText, extractedText).sort((a, b) => b.similarity - a.similarity)[0] ?? {
    text: extractedText,
    similarity: 0,
  };
}

export function reviewProofSimilarity(draftText: string, extractedText: string) {
  return bestReviewProofCandidate(draftText, extractedText).similarity;
}

function checkPlaceName(expectedPlaceName: string | undefined, candidateText: string): ReviewProofCheckStatus {
  const expected = expectedPlaceName?.trim();
  if (!expected) return "UNKNOWN" satisfies ReviewProofCheckStatus;
  const candidate = compact(candidateText);
  return placeNameAliases(expected).some((alias) => matchesPlaceNameAlias(candidate, alias))
    ? ("PASS" satisfies ReviewProofCheckStatus)
    : ("FAIL" satisfies ReviewProofCheckStatus);
}

function checkFiveStar(candidateText: string): ReviewProofCheckStatus {
  if (NON_FIVE_CATEGORY_SCORE_PATTERN.test(candidateText) || NON_FIVE_STAR_PATTERN.test(candidateText)) {
    return "FAIL" satisfies ReviewProofCheckStatus;
  }
  if (FIVE_STAR_PATTERN.test(candidateText) || FIVE_CATEGORY_SCORE_PATTERN.test(candidateText)) {
    return "PASS" satisfies ReviewProofCheckStatus;
  }
  return "UNKNOWN" satisfies ReviewProofCheckStatus;
}

function parseReviewAgeDays(candidateText: string) {
  if (/방금|방금\s*전|신규|오늘|어제/.test(candidateText)) return 0;
  const matches = Array.from(candidateText.matchAll(/(\d+)\s*(분|시간|일|주|개월|년)\s*전/gu));
  if (!matches.length) return null;

  return Math.min(
    ...matches.map((match) => {
      const amount = Number(match[1]);
      const unit = match[2];
      if (unit === "분" || unit === "시간") return 0;
      if (unit === "일") return amount;
      if (unit === "주") return amount * 7;
      if (unit === "개월") return amount * 30;
      return amount * 365;
    }),
  );
}

function checkRecency(candidateText: string, maxReviewAgeDays: number): ReviewProofCheckStatus {
  const days = parseReviewAgeDays(candidateText);
  if (days === null) return "UNKNOWN" satisfies ReviewProofCheckStatus;
  return days <= maxReviewAgeDays ? ("PASS" satisfies ReviewProofCheckStatus) : ("FAIL" satisfies ReviewProofCheckStatus);
}

function evaluateReviewProofChecks(input: {
  candidateText: string;
  expectedPlaceName?: string;
  maxReviewAgeDays: number;
}): NonNullable<ReviewProofAnalysis["checks"]> {
  return {
    placeName: checkPlaceName(input.expectedPlaceName, input.candidateText),
    rating: checkFiveStar(input.candidateText),
    recency: checkRecency(input.candidateText, input.maxReviewAgeDays),
  };
}

export function decideReviewProofAnalysis(input: {
  draftText: string;
  extractedText: string;
  confidence?: number;
  provider?: string;
  expectedPlaceName?: string;
  maxReviewAgeDays?: number;
}): ReviewProofAnalysis {
  const provider = input.provider ?? "local";
  const extractedText = input.extractedText.slice(0, 4000);
  const normalizedExtracted = compact(extractedText);
  if (normalizedExtracted.length < 10) {
    return {
      status: "UNAVAILABLE",
      provider,
      extractedText,
      similarity: 0,
      reason: "OCR_TEXT_UNAVAILABLE",
      confidence: input.confidence ?? 0,
    };
  }

  const candidate = bestReviewProofCandidate(input.draftText, extractedText);
  const similarity = candidate.similarity;
  const approveThreshold = envNumber("REVIEW_PROOF_AUTO_APPROVE_THRESHOLD", DEFAULT_AUTO_APPROVE_THRESHOLD);
  const rejectThreshold = envNumber("REVIEW_PROOF_AUTO_REJECT_THRESHOLD", DEFAULT_AUTO_REJECT_THRESHOLD);
  const maxReviewAgeDays = input.maxReviewAgeDays ?? envNumber("REVIEW_PROOF_MAX_AGE_DAYS", DEFAULT_MAX_REVIEW_AGE_DAYS);
  let status: ReviewProofAnalysisStatus =
    similarity >= approveThreshold
      ? "AUTO_APPROVE"
      : similarity <= rejectThreshold && normalizedExtracted.length >= 40
        ? "AUTO_REJECT"
        : "MANUAL_REVIEW";
  let reason =
    status === "AUTO_APPROVE"
      ? "DRAFT_TEXT_MATCHED"
      : status === "AUTO_REJECT"
        ? "DRAFT_TEXT_MISMATCHED"
        : "SIMILARITY_REVIEW_REQUIRED";
  const checks = input.expectedPlaceName?.trim()
    ? evaluateReviewProofChecks({
        candidateText: candidate.text,
        expectedPlaceName: input.expectedPlaceName,
        maxReviewAgeDays,
      })
    : undefined;

  if (checks?.rating === "FAIL") {
    status = "AUTO_REJECT";
    reason = "RATING_NOT_FIVE_STAR";
  } else if (checks?.recency === "FAIL") {
    status = "AUTO_REJECT";
    reason = "REVIEW_TOO_OLD";
  } else if (status === "AUTO_APPROVE" && checks && checks.placeName !== "PASS") {
    status = "MANUAL_REVIEW";
    reason = "PLACE_NAME_NOT_FOUND";
  }

  return {
    status,
    provider,
    extractedText,
    similarity,
    reason,
    confidence: input.confidence ?? 0,
    ...(checks ? { checks } : {}),
  };
}

export async function analyzeReviewProof(input: ReviewProofAnalysisInput): Promise<ReviewProofAnalysis> {
  const provider = getOcrProvider();
  const result = await provider.extract({
    imageBytes: input.imageBytes,
    mimeType: input.mimeType,
    mockText: process.env.NODE_ENV !== "production" ? input.mockText : undefined,
  });
  return decideReviewProofAnalysis({
    draftText: input.draftText,
    extractedText: result.rawText,
    confidence: result.confidence,
    provider: provider.name,
    expectedPlaceName: input.expectedPlaceName,
    maxReviewAgeDays: input.maxReviewAgeDays,
  });
}
