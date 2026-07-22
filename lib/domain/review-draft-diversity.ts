export const REVIEW_DRAFT_DIVERSITY_VERSION = "review-diversity-v3";
export const REVIEW_DRAFT_SIMILARITY_LIMIT = 0.72;

export const REVIEW_DRAFT_TONES = [
  "PLAIN",
  "FRIENDLY",
  "CALM",
  "LIVELY",
  "SPECIFIC",
] as const;

export const REVIEW_DRAFT_STRUCTURES = [
  "POINT_FIRST",
  "DETAIL_FIRST",
  "PARALLEL_POINTS",
  "SHORT_SINGLE",
  "THREE_STEP",
] as const;

export type ReviewDraftTone = (typeof REVIEW_DRAFT_TONES)[number];
export type ReviewDraftStructure = (typeof REVIEW_DRAFT_STRUCTURES)[number];
export type ReviewDraftEndingStyle =
  | "FORMAL"
  | "CONVERSATIONAL"
  | "OBSERVATIONAL"
  | "SOFT_COPULA"
  | "NOUN_PHRASE";

export interface ReviewDraftStyleSlot {
  index: number;
  id: string;
  tone: ReviewDraftTone;
  structure: ReviewDraftStructure;
  toneLabel: string;
  structureLabel: string;
  endingStyle: ReviewDraftEndingStyle;
  endingLabel: string;
  endingInstruction: string;
  instruction: string;
  minNonSpace: number;
  maxNonSpace: number;
  minSentences: number;
  maxSentences: number;
  maxExclamations: number;
}

const TONE_META: Record<ReviewDraftTone, { label: string; instruction: string }> = {
  PLAIN: { label: "담백형", instruction: "과장 없이 단정한 해요체로 쓴다." },
  FRIENDLY: { label: "친근형", instruction: "부드럽고 편안한 구어체로 쓴다." },
  CALM: { label: "차분형", instruction: "관찰한 정보를 차분한 서술체로 정리한다." },
  LIVELY: { label: "경쾌형", instruction: "짧고 리듬감 있게 쓰되 감탄부호는 제한한다." },
  SPECIFIC: { label: "구체형", instruction: "승인 근거의 구체적인 특징을 중심으로 쓴다." },
};

const ENDING_META: Record<
  ReviewDraftEndingStyle,
  { label: string; instruction: string }
> = {
  FORMAL: {
    label: "간결한 격식형",
    instruction: "격식체는 꼭 필요한 한 문장에만 쓰고, ~습니다와 ~입니다를 연달아 반복하지 않는다.",
  },
  CONVERSATIONAL: {
    label: "자연스러운 해요체",
    instruction: "~해요, ~있어요, ~좋아 보여요처럼 부드러운 해요체를 자연스럽게 섞는다.",
  },
  OBSERVATIONAL: {
    label: "관찰형",
    instruction: "~눈에 띄어요, ~느껴져요, ~인 듯해요처럼 사실을 관찰하는 말투로 마무리한다.",
  },
  SOFT_COPULA: {
    label: "부드러운 서술형",
    instruction: "~인 곳이에요, ~한 편이에요, ~가 포인트예요처럼 부드러운 서술형을 사용한다.",
  },
  NOUN_PHRASE: {
    label: "리듬감 있는 명사형",
    instruction: "마지막을 ~한 구성, ~가 돋보이는 공간 같은 짧은 명사형으로 맺어 리듬을 바꾼다.",
  },
};

const ENDING_STYLE_SEQUENCE: ReviewDraftEndingStyle[] = [
  "FORMAL",
  "CONVERSATIONAL",
  "OBSERVATIONAL",
  "SOFT_COPULA",
  "NOUN_PHRASE",
  "CONVERSATIONAL",
  "OBSERVATIONAL",
  "SOFT_COPULA",
  "NOUN_PHRASE",
  "CONVERSATIONAL",
  "FORMAL",
  "OBSERVATIONAL",
  "SOFT_COPULA",
  "NOUN_PHRASE",
  "CONVERSATIONAL",
  "OBSERVATIONAL",
  "SOFT_COPULA",
  "NOUN_PHRASE",
  "CONVERSATIONAL",
  "OBSERVATIONAL",
  "FORMAL",
  "SOFT_COPULA",
  "NOUN_PHRASE",
  "CONVERSATIONAL",
  "OBSERVATIONAL",
];

const STRUCTURE_META: Record<
  ReviewDraftStructure,
  {
    label: string;
    instruction: string;
    minNonSpace: number;
    maxNonSpace: number;
    minSentences: number;
    maxSentences: number;
    maxExclamations: number;
  }
> = {
  POINT_FIRST: {
    label: "핵심 우선",
    instruction: "가장 눈에 띄는 특징을 먼저 말하고 근거를 덧붙인다.",
    minNonSpace: 45,
    maxNonSpace: 110,
    minSentences: 2,
    maxSentences: 2,
    maxExclamations: 0,
  },
  DETAIL_FIRST: {
    label: "세부 우선",
    instruction: "구체적인 세부 정보를 먼저 제시하고 짧게 정리한다.",
    minNonSpace: 55,
    maxNonSpace: 125,
    minSentences: 2,
    maxSentences: 2,
    maxExclamations: 0,
  },
  PARALLEL_POINTS: {
    label: "두 포인트 병렬",
    instruction: "서로 다른 승인 근거 두 가지를 균형 있게 연결한다.",
    minNonSpace: 60,
    maxNonSpace: 145,
    minSentences: 2,
    maxSentences: 3,
    maxExclamations: 0,
  },
  SHORT_SINGLE: {
    label: "짧은 단문",
    instruction: "한 가지 핵심만 자연스러운 한 문장으로 압축한다.",
    minNonSpace: 30,
    maxNonSpace: 72,
    minSentences: 1,
    maxSentences: 1,
    maxExclamations: 1,
  },
  THREE_STEP: {
    label: "3문장 흐름",
    instruction: "서로 다른 세부 정보와 전체 인상을 세 문장으로 전개한다.",
    minNonSpace: 85,
    maxNonSpace: 180,
    minSentences: 3,
    maxSentences: 3,
    maxExclamations: 1,
  },
};

export const REVIEW_DRAFT_STYLE_SLOTS: ReviewDraftStyleSlot[] = REVIEW_DRAFT_TONES.flatMap(
  (tone, toneIndex) =>
    REVIEW_DRAFT_STRUCTURES.map((structure, structureIndex) => {
      const index = toneIndex * REVIEW_DRAFT_STRUCTURES.length + structureIndex;
      const toneMeta = TONE_META[tone];
      const structureMeta = STRUCTURE_META[structure];
      const endingStyle = ENDING_STYLE_SEQUENCE[index];
      const endingMeta = ENDING_META[endingStyle];
      return {
        index,
        id: `v2-${String(index + 1).padStart(2, "0")}-${tone.toLowerCase()}-${structure.toLowerCase()}`,
        tone,
        structure,
        toneLabel: toneMeta.label,
        structureLabel: structureMeta.label,
        endingStyle,
        endingLabel: endingMeta.label,
        endingInstruction: endingMeta.instruction,
        instruction: `${toneMeta.instruction} ${structureMeta.instruction} ${endingMeta.instruction}`,
        minNonSpace: structureMeta.minNonSpace,
        maxNonSpace: structureMeta.maxNonSpace,
        minSentences: structureMeta.minSentences,
        maxSentences: structureMeta.maxSentences,
        maxExclamations: structureMeta.maxExclamations,
      };
    }),
);

export function styleSlotForSequence(sequence: number) {
  const normalized = Number.isFinite(sequence) ? Math.max(0, Math.floor(sequence)) : 0;
  return REVIEW_DRAFT_STYLE_SLOTS[normalized % REVIEW_DRAFT_STYLE_SLOTS.length];
}

export function normalizeDraftForComparison(text: string) {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z가-힣]/g, "");
}

function ngrams(text: string, size = 3) {
  const normalized = normalizeDraftForComparison(text);
  if (!normalized) return new Set<string>();
  if (normalized.length <= size) return new Set([normalized]);
  const result = new Set<string>();
  for (let index = 0; index <= normalized.length - size; index += 1) {
    result.add(normalized.slice(index, index + size));
  }
  return result;
}

export function draftSimilarity(left: string, right: string) {
  const leftGrams = ngrams(left);
  const rightGrams = ngrams(right);
  if (leftGrams.size === 0 || rightGrams.size === 0) return 0;
  let intersection = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) intersection += 1;
  }
  return (2 * intersection) / (leftGrams.size + rightGrams.size);
}

function hasRepeatedOpening(text: string, existing: string[]) {
  const opening = normalizeDraftForComparison(text).slice(0, 10);
  return opening.length === 10 && existing.some((draft) => normalizeDraftForComparison(draft).startsWith(opening));
}

function hasRepeatedLongPhrase(text: string, existing: string[]) {
  const normalized = normalizeDraftForComparison(text);
  if (normalized.length < 12) return false;
  for (let index = 0; index <= normalized.length - 12; index += 1) {
    const phrase = normalized.slice(index, index + 12);
    if (existing.some((draft) => normalizeDraftForComparison(draft).includes(phrase))) return true;
  }
  return false;
}

export interface DraftQualityIssue {
  code:
    | "HIGH_SIMILARITY"
    | "REPEATED_OPENING"
    | "REPEATED_PHRASE"
    | "OVERUSED_ENDING_STYLE";
  message: string;
  similarity?: number;
}

export function draftEndingStyle(text: string): ReviewDraftEndingStyle {
  const ending = text.trim().replace(/[.!?…。！？”’"']+$/gu, "").trim();
  if (/(?:습니다|ㅂ니다|입니다|합니다|됩니다|있습니다|없습니다)$/u.test(ending)) {
    return "FORMAL";
  }
  if (/(?:눈에\s*띄어요|느껴져요|보여요|듯해요)$/u.test(ending)) {
    return "OBSERVATIONAL";
  }
  if (/(?:곳이에요|편이에요|포인트예요|느낌이에요|구성이에요)$/u.test(ending)) {
    return "SOFT_COPULA";
  }
  if (/(?:해요|어요|아요|예요|이에요|돼요|네요)$/u.test(ending)) {
    return "CONVERSATIONAL";
  }
  return "NOUN_PHRASE";
}

export function findDraftQualityIssues(text: string, existing: string[]): DraftQualityIssue[] {
  const similarities = existing.map((draft) => draftSimilarity(text, draft));
  const maxSimilarity = similarities.length ? Math.max(...similarities) : 0;
  const issues: DraftQualityIssue[] = [];
  if (maxSimilarity >= REVIEW_DRAFT_SIMILARITY_LIMIT) {
    issues.push({
      code: "HIGH_SIMILARITY",
      message: `기존 원고와 유사도가 ${maxSimilarity.toFixed(3)}입니다.`,
      similarity: maxSimilarity,
    });
  }
  if (hasRepeatedOpening(text, existing)) {
    issues.push({ code: "REPEATED_OPENING", message: "기존 원고와 도입부가 같습니다." });
  }
  if (hasRepeatedLongPhrase(text, existing)) {
    issues.push({ code: "REPEATED_PHRASE", message: "기존 원고와 긴 연속 문구가 겹칩니다." });
  }
  const endingStyle = draftEndingStyle(text);
  const endingStyleCount = existing.filter(
    (draft) => draftEndingStyle(draft) === endingStyle,
  ).length;
  const endingStyleLimit = endingStyle === "FORMAL" ? 4 : 7;
  if (endingStyleCount >= endingStyleLimit) {
    issues.push({
      code: "OVERUSED_ENDING_STYLE",
      message: `${ENDING_META[endingStyle].label} 종결이 이미 ${endingStyleLimit}건 사용되었습니다.`,
    });
  }
  return issues;
}

export function analyzeDraftDiversity(texts: string[]) {
  let pairCount = 0;
  let similaritySum = 0;
  let maxSimilarity = 0;
  let duplicateCount = 0;
  for (let left = 0; left < texts.length; left += 1) {
    for (let right = left + 1; right < texts.length; right += 1) {
      const similarity = draftSimilarity(texts[left], texts[right]);
      pairCount += 1;
      similaritySum += similarity;
      maxSimilarity = Math.max(maxSimilarity, similarity);
      if (similarity >= REVIEW_DRAFT_SIMILARITY_LIMIT) duplicateCount += 1;
    }
  }
  return {
    pairCount,
    maxSimilarity,
    averageSimilarity: pairCount ? similaritySum / pairCount : 0,
    duplicateCount,
  };
}
