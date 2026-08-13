import { prisma } from "@/lib/db";
import { draftSimilarity } from "@/lib/domain/review-draft-diversity";
import { Prisma, type PrismaClient } from "@prisma/client";

const MAX_PERSONA_NAME_LENGTH = 40;
const MAX_PERSONA_INSTRUCTION_LENGTH = 600;
const MAX_PERSONA_EXAMPLES = 50;
const MAX_PERSONA_EXAMPLE_LENGTH = 600;
const MAX_PERSONA_REFERENCE_URLS = 10;
const MAX_PERSONA_REFERENCE_URL_LENGTH = 1_000;
const MAX_STYLE_PROMPT_EXAMPLES = 20;
const LEARNING_REVIEW_SIMILARITY_LIMIT = 0.9;

const EMAIL_PATTERN = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/iu;
const PHONE_PATTERN = /(?:\+?82[-\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/u;
const RESIDENT_ID_PATTERN = /\b\d{6}[-\s]?[1-4]\d{6}\b/u;
const SECRET_PATTERN = /(?:AIza[0-9A-Za-z_-]{20,}|-----BEGIN (?:RSA |EC |)PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|secret)\s*[:=])/iu;
const PROMPT_INJECTION_PATTERN = /(?:ignore\s+(?:all\s+)?previous\s+instructions|reveal\s+(?:the\s+)?system\s+prompt|이전\s*(?:지시|명령).{0,12}(?:무시|취소)|시스템\s*프롬프트.{0,12}(?:공개|출력))/iu;

export type ReviewDraftPersonaInput = {
  name: string;
  styleInstruction: string;
  examples: string[];
  referenceUrls?: string[];
  active?: boolean;
};

export type ReviewDraftPersona = {
  id: string;
  name: string;
  styleInstruction: string;
  examples: string[];
  referenceUrls: string[];
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type ReviewDraftPersonaRecord = Omit<ReviewDraftPersona, "examples" | "referenceUrls"> & {
  examplesJson: string;
  referenceUrlsJson: string;
};

type ReviewDraftPersonaDb = Pick<PrismaClient | Prisma.TransactionClient, "reviewDraftPersona" | "draftTrainingExample" | "draftTuningDataset">;

export class ReviewDraftPersonaError extends Error {
  constructor(
    public readonly code:
      | "INVALID_REVIEW_DRAFT_PERSONA"
      | "INVALID_REVIEW_DRAFT_PERSONA_EXAMPLE"
      | "INVALID_REVIEW_DRAFT_PERSONA_REFERENCE_URL"
      | "REVIEW_DRAFT_PERSONA_EXAMPLE_LIMIT"
      | "REVIEW_DRAFT_PERSONA_EXAMPLE_TOO_SIMILAR"
      | "REVIEW_DRAFT_PERSONA_NOT_FOUND"
      | "REVIEW_DRAFT_PERSONA_IN_USE"
      | "REVIEW_DRAFT_PERSONA_NAME_EXISTS",
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "ReviewDraftPersonaError";
  }
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/<[^>]*>/gu, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function assertSafeLearningText(value: string) {
  if (EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value) || RESIDENT_ID_PATTERN.test(value)) {
    throw new ReviewDraftPersonaError("INVALID_REVIEW_DRAFT_PERSONA_EXAMPLE", "학습용 원고에는 개인 식별 정보를 포함할 수 없습니다.");
  }
  if (SECRET_PATTERN.test(value)) {
    throw new ReviewDraftPersonaError("INVALID_REVIEW_DRAFT_PERSONA_EXAMPLE", "학습용 원고에는 인증 정보나 비밀값을 포함할 수 없습니다.");
  }
  if (PROMPT_INJECTION_PATTERN.test(value)) {
    throw new ReviewDraftPersonaError("INVALID_REVIEW_DRAFT_PERSONA_EXAMPLE", "시스템 지시를 바꾸려는 내용은 학습용 원고에 저장할 수 없습니다.");
  }
}

function normalizeExamples(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const examples: string[] = [];
  for (const candidate of values) {
    const example = cleanText(candidate, MAX_PERSONA_EXAMPLE_LENGTH);
    if (!example || seen.has(example)) continue;
    assertSafeLearningText(example);
    seen.add(example);
    examples.push(example);
    if (examples.length === MAX_PERSONA_EXAMPLES) break;
  }
  return examples;
}

function parseExamples(value: string) {
  try {
    return normalizeExamples(JSON.parse(value));
  } catch {
    return [];
  }
}

function normalizeReferenceUrls(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const candidate of values) {
    const source = cleanText(candidate, MAX_PERSONA_REFERENCE_URL_LENGTH);
    if (!source) continue;
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      throw new ReviewDraftPersonaError("INVALID_REVIEW_DRAFT_PERSONA_REFERENCE_URL", "참고 URL은 올바른 HTTPS 주소로 입력해 주세요.");
    }
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      throw new ReviewDraftPersonaError("INVALID_REVIEW_DRAFT_PERSONA_REFERENCE_URL", "참고 URL은 로그인 정보가 없는 HTTPS 주소만 사용할 수 있습니다.");
    }
    const normalized = url.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
    if (urls.length === MAX_PERSONA_REFERENCE_URLS) break;
  }
  return urls;
}

function parseReferenceUrls(value: string) {
  try {
    return normalizeReferenceUrls(JSON.parse(value));
  } catch {
    return [];
  }
}

export function reviewDraftPersonaExamplesForPrompt(examples: readonly string[]) {
  return normalizeExamples(examples).slice(-MAX_STYLE_PROMPT_EXAMPLES);
}

export function normalizeReviewDraftPersonaInput(value: unknown): Required<ReviewDraftPersonaInput> {
  const input = value && typeof value === "object" ? (value as Partial<ReviewDraftPersonaInput>) : {};
  const name = cleanText(input.name, MAX_PERSONA_NAME_LENGTH);
  const styleInstruction = cleanText(input.styleInstruction, MAX_PERSONA_INSTRUCTION_LENGTH);
  const examples = normalizeExamples(input.examples);
  const referenceUrls = normalizeReferenceUrls(input.referenceUrls);
  const active = input.active !== false;

  if (name.length < 2) {
    throw new ReviewDraftPersonaError("INVALID_REVIEW_DRAFT_PERSONA", "가상 리뷰어 이름을 2자 이상 입력해 주세요.");
  }
  if (styleInstruction && styleInstruction.length < 6) {
    throw new ReviewDraftPersonaError("INVALID_REVIEW_DRAFT_PERSONA", "스타일 설명은 6자 이상 입력해 주세요.");
  }
  return { name, styleInstruction, examples, referenceUrls, active };
}

export function normalizeReviewDraftPersonaExample(value: unknown) {
  const example = cleanText(value, MAX_PERSONA_EXAMPLE_LENGTH);
  if (example.length < 6) {
    throw new ReviewDraftPersonaError("INVALID_REVIEW_DRAFT_PERSONA_EXAMPLE", "학습용 원고를 6자 이상 입력해 주세요.");
  }
  assertSafeLearningText(example);
  return example;
}

export function toReviewDraftPersona(record: ReviewDraftPersonaRecord): ReviewDraftPersona {
  return {
    id: record.id,
    name: record.name,
    styleInstruction: record.styleInstruction,
    examples: parseExamples(record.examplesJson),
    referenceUrls: parseReferenceUrls(record.referenceUrlsJson),
    active: record.active,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function personaForDraftSequence<T extends Pick<ReviewDraftPersona, "id">>(personas: readonly T[], sequence: number) {
  if (!personas.length) return undefined;
  const index = Number.isFinite(sequence) ? Math.max(0, Math.floor(sequence)) : 0;
  return personas[index % personas.length];
}

export async function listReviewDraftPersonas(db: ReviewDraftPersonaDb = prisma, activeOnly = false) {
  const personas = await db.reviewDraftPersona.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  return personas.map(toReviewDraftPersona);
}

export async function createReviewDraftPersona(value: unknown, db: ReviewDraftPersonaDb = prisma) {
  const input = normalizeReviewDraftPersonaInput(value);
  try {
    return toReviewDraftPersona(await db.reviewDraftPersona.create({
      data: {
        name: input.name,
        styleInstruction: input.styleInstruction,
        examplesJson: JSON.stringify(input.examples),
        referenceUrlsJson: JSON.stringify(input.referenceUrls),
        active: input.active,
      },
    }));
  } catch (error) {
    if (isUniqueNameError(error)) throw new ReviewDraftPersonaError("REVIEW_DRAFT_PERSONA_NAME_EXISTS", "같은 이름의 가상 리뷰어가 이미 있습니다.", 409);
    throw error;
  }
}

export async function updateReviewDraftPersona(personaId: string, value: unknown, db: ReviewDraftPersonaDb = prisma) {
  const id = cleanText(personaId, 100);
  const input = normalizeReviewDraftPersonaInput(value);
  const existing = id ? await db.reviewDraftPersona.findUnique({ where: { id } }) : null;
  if (!existing) throw new ReviewDraftPersonaError("REVIEW_DRAFT_PERSONA_NOT_FOUND", "가상 리뷰어를 찾을 수 없습니다.", 404);
  try {
    return toReviewDraftPersona(await db.reviewDraftPersona.update({
      where: { id },
      data: {
        name: input.name,
        styleInstruction: input.styleInstruction,
        examplesJson: JSON.stringify(input.examples),
        referenceUrlsJson: JSON.stringify(input.referenceUrls),
        active: input.active,
        version: { increment: 1 },
      },
    }));
  } catch (error) {
    if (isUniqueNameError(error)) throw new ReviewDraftPersonaError("REVIEW_DRAFT_PERSONA_NAME_EXISTS", "같은 이름의 가상 리뷰어가 이미 있습니다.", 409);
    throw error;
  }
}

export async function appendReviewDraftPersonaExample(personaId: string, value: unknown, db: ReviewDraftPersonaDb = prisma) {
  const id = cleanText(personaId, 100);
  const example = normalizeReviewDraftPersonaExample(value);
  const existing = id ? await db.reviewDraftPersona.findUnique({ where: { id } }) : null;
  if (!existing) throw new ReviewDraftPersonaError("REVIEW_DRAFT_PERSONA_NOT_FOUND", "가상 리뷰어를 찾을 수 없습니다.", 404);

  const examples = parseExamples(existing.examplesJson);
  const maximumSimilarity = examples.length ? Math.max(...examples.map((current) => draftSimilarity(example, current))) : 0;
  if (maximumSimilarity >= LEARNING_REVIEW_SIMILARITY_LIMIT) {
    throw new ReviewDraftPersonaError("REVIEW_DRAFT_PERSONA_EXAMPLE_TOO_SIMILAR", "기존 학습용 원고와 지나치게 유사한 원고는 추가할 수 없습니다.", 409);
  }
  if (examples.length >= MAX_PERSONA_EXAMPLES) {
    throw new ReviewDraftPersonaError("REVIEW_DRAFT_PERSONA_EXAMPLE_LIMIT", `학습용 원고는 최대 ${MAX_PERSONA_EXAMPLES}개까지 저장할 수 있습니다.`);
  }
  const persona = await db.reviewDraftPersona.update({
    where: { id },
    data: { examplesJson: JSON.stringify([...examples, example]), version: { increment: 1 } },
  });
  return toReviewDraftPersona(persona);
}

export async function deleteReviewDraftPersona(personaId: string, db: ReviewDraftPersonaDb = prisma) {
  const id = cleanText(personaId, 100);
  const existing = id ? await db.reviewDraftPersona.findUnique({ where: { id } }) : null;
  if (!existing) throw new ReviewDraftPersonaError("REVIEW_DRAFT_PERSONA_NOT_FOUND", "가상 리뷰어를 찾을 수 없습니다.", 404);
  const [trainingExampleCount, datasetCount] = await Promise.all([
    db.draftTrainingExample.count({ where: { personaId: id } }),
    db.draftTuningDataset.count({ where: { personaId: id } }),
  ]);
  if (trainingExampleCount || datasetCount) {
    throw new ReviewDraftPersonaError(
      "REVIEW_DRAFT_PERSONA_IN_USE",
      "학습 데이터 또는 데이터셋이 있는 가상 리뷰어는 삭제할 수 없습니다. 비활성화로 보관해 주세요.",
      409,
    );
  }
  await db.reviewDraftPersona.delete({ where: { id } });
}

function isUniqueNameError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}
