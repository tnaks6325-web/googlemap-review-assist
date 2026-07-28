import { createHash } from "node:crypto";

export const DRAFT_FINE_TUNING_BASE_MODEL = "gemini-3.5-flash";
export const DRAFT_FINE_TUNING_REGION = "us-central1";
export const DRAFT_FINE_TUNING_MIN_TRAIN_EXAMPLES = 100;
export const DRAFT_FINE_TUNING_MIN_VALIDATION_EXAMPLES = 20;
export const DRAFT_FINE_TUNING_SYSTEM_INSTRUCTION =
  "구글맵 리뷰 캠페인용 자연스러운 한국어 원고를 작성한다.";

export type DraftTrainingExampleSource = "MANUAL" | "ADMIN_REVISION";
export type DraftTrainingExampleSplit = "TRAIN" | "VALIDATION";
export type DraftTuningJobStatus =
  | "SUBMITTING"
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export class DraftFineTuningError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "DraftFineTuningError";
  }
}

interface TrainingExampleInput {
  sourceType: DraftTrainingExampleSource;
  industry?: string | null;
  inputText: string;
  outputText: string;
  split: DraftTrainingExampleSplit;
}

export interface ValidatedTrainingExample extends TrainingExampleInput {
  industry: string | null;
  contentHash: string;
}

const EMAIL_PATTERN = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/iu;
const PHONE_PATTERN = /(?:\+?82[-\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/u;
const RESIDENT_ID_PATTERN = /\b\d{6}[-\s]?[1-4]\d{6}\b/u;
const SECRET_PATTERN = /(?:AIza[0-9A-Za-z_-]{20,}|-----BEGIN (?:RSA |EC |)PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|secret)\s*[:=])/iu;
const PROMPT_INJECTION_PATTERN = /(?:이전|위의|모든)\s*(?:지시|명령).{0,12}(?:무시|취소)|시스템\s*프롬프트.{0,12}(?:공개|출력)|ignore\s+(?:all\s+)?previous\s+instructions|reveal\s+(?:the\s+)?system\s+prompt/iu;

function normalizeTrainingText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/<[^>]*>/gu, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function assertTextBoundary(label: "입력" | "출력", value: string, min: number, max: number) {
  if (value.length < min || value.length > max) {
    throw new DraftFineTuningError(
      "TRAINING_EXAMPLE_LENGTH_INVALID",
      `${label}은 ${min}자 이상 ${max.toLocaleString("ko-KR")}자 이하여야 합니다.`,
    );
  }
}

function assertTrainingTextSafe(value: string) {
  if (EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value) || RESIDENT_ID_PATTERN.test(value)) {
    throw new DraftFineTuningError(
      "TRAINING_EXAMPLE_PII_DETECTED",
      "학습 자료에 이메일, 전화번호 또는 개인식별정보를 포함할 수 없습니다.",
    );
  }
  if (SECRET_PATTERN.test(value)) {
    throw new DraftFineTuningError(
      "TRAINING_EXAMPLE_SECRET_DETECTED",
      "학습 자료에 인증정보나 비밀키 형태의 문자열을 포함할 수 없습니다.",
    );
  }
  if (PROMPT_INJECTION_PATTERN.test(value)) {
    throw new DraftFineTuningError(
      "TRAINING_EXAMPLE_PROMPT_INJECTION",
      "시스템 지시를 변경하거나 공개하도록 요구하는 자료는 등록할 수 없습니다.",
    );
  }
}

export function trainingExampleContentHash(inputText: string, outputText: string) {
  return createHash("sha256")
    .update(`${inputText}\u0000${outputText}`)
    .digest("hex");
}

export function validateTrainingExampleInput(input: TrainingExampleInput): ValidatedTrainingExample {
  if (input.sourceType !== "MANUAL" && input.sourceType !== "ADMIN_REVISION") {
    throw new DraftFineTuningError("TRAINING_EXAMPLE_SOURCE_INVALID", "지원하지 않는 학습 자료 출처입니다.");
  }
  if (input.split !== "TRAIN" && input.split !== "VALIDATION") {
    throw new DraftFineTuningError("TRAINING_EXAMPLE_SPLIT_INVALID", "훈련 또는 검증 분할을 선택해 주세요.");
  }

  const inputText = normalizeTrainingText(input.inputText);
  const outputText = normalizeTrainingText(input.outputText);
  const industry = normalizeTrainingText(input.industry ?? "").slice(0, 80) || null;
  assertTextBoundary("입력", inputText, 20, 6_000);
  assertTextBoundary("출력", outputText, 20, 1_000);
  assertTrainingTextSafe(inputText);
  assertTrainingTextSafe(outputText);

  return {
    sourceType: input.sourceType,
    industry,
    inputText,
    outputText,
    split: input.split,
    contentHash: trainingExampleContentHash(inputText, outputText),
  };
}

export function buildGeminiTrainingJsonlRow(example: Pick<ValidatedTrainingExample, "inputText" | "outputText">) {
  return JSON.stringify({
    systemInstruction: {
      parts: [{ text: DRAFT_FINE_TUNING_SYSTEM_INSTRUCTION }],
    },
    contents: [
      { role: "user", parts: [{ text: example.inputText }] },
      { role: "model", parts: [{ text: example.outputText }] },
    ],
  });
}

interface FineTuningEvaluationSummary {
  comparisonCount: number;
  candidateWinRate: number;
  criticalFailureCount: number;
}

export function validateFineTuningEvaluation(input: {
  comparisonCount: unknown;
  candidateWins: unknown;
  criticalFailureCount: unknown;
}) {
  const values = [input.comparisonCount, input.candidateWins, input.criticalFailureCount].map(Number);
  if (values.some((value) => !Number.isFinite(value) || value < 0 || !Number.isInteger(value))) {
    throw new DraftFineTuningError("EVALUATION_INVALID", "평가 수치는 0 이상의 정수로 입력해 주세요.");
  }
  const comparisonCount = values[0] ?? 0;
  const candidateWins = values[1] ?? 0;
  const criticalFailureCount = values[2] ?? 0;
  if (candidateWins > comparisonCount) {
    throw new DraftFineTuningError("EVALUATION_INVALID", "후보 모델 승리 수는 전체 비교 수보다 클 수 없습니다.");
  }
  return {
    comparisonCount,
    candidateWins,
    candidateWinRate: comparisonCount ? candidateWins / comparisonCount : 0,
    criticalFailureCount,
  };
}

interface FineTuningReadinessInput {
  approvedTrainCount: number;
  approvedValidationCount: number;
  activeIndustryCount: number;
  coveredIndustryCount: number;
  coveredStyleCount: number;
  targetStyleCount: number;
  approvedRevisionCount: number;
  latestEvaluation: FineTuningEvaluationSummary | null;
}

function boundedRatio(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(1, numerator / denominator));
}

export function calculateFineTuningReadiness(input: FineTuningReadinessInput) {
  const trainScore = 30 * boundedRatio(input.approvedTrainCount, DRAFT_FINE_TUNING_MIN_TRAIN_EXAMPLES);
  const industryScore = 15 * boundedRatio(input.coveredIndustryCount, input.activeIndustryCount);
  const styleScore = 15 * boundedRatio(input.coveredStyleCount, input.targetStyleCount);
  const revisionRatio = input.approvedTrainCount
    ? input.approvedRevisionCount / input.approvedTrainCount
    : 0;
  const revisionScore = 10 * boundedRatio(revisionRatio, 0.3);
  const validationScore = 15 * boundedRatio(
    input.approvedValidationCount,
    DRAFT_FINE_TUNING_MIN_VALIDATION_EXAMPLES,
  );
  const evaluationScore = input.latestEvaluation
    && input.latestEvaluation.comparisonCount >= 20
    && input.latestEvaluation.candidateWinRate >= 0.6
    && input.latestEvaluation.criticalFailureCount === 0
    ? 15
    : 0;
  const score = Math.min(100, Math.round(
    trainScore + industryScore + styleScore + revisionScore + validationScore + evaluationScore,
  ));
  const gaps: string[] = [];
  if (input.approvedTrainCount < DRAFT_FINE_TUNING_MIN_TRAIN_EXAMPLES) {
    gaps.push(`훈련 자료 ${DRAFT_FINE_TUNING_MIN_TRAIN_EXAMPLES - input.approvedTrainCount}건 추가 필요`);
  }
  if (input.approvedValidationCount < DRAFT_FINE_TUNING_MIN_VALIDATION_EXAMPLES) {
    gaps.push(`검증 자료 ${DRAFT_FINE_TUNING_MIN_VALIDATION_EXAMPLES - input.approvedValidationCount}건 추가 필요`);
  }
  if (input.coveredIndustryCount < input.activeIndustryCount) {
    gaps.push(`미확보 업종 ${input.activeIndustryCount - input.coveredIndustryCount}개 보완 필요`);
  }
  if (input.coveredStyleCount < input.targetStyleCount) {
    gaps.push(`문체 유형 ${input.targetStyleCount - input.coveredStyleCount}개 보완 필요`);
  }

  return {
    score,
    readyForDataset:
      input.approvedTrainCount >= DRAFT_FINE_TUNING_MIN_TRAIN_EXAMPLES
      && input.approvedValidationCount >= DRAFT_FINE_TUNING_MIN_VALIDATION_EXAMPLES,
    gaps,
  };
}

export function mapVertexTuningJobState(state: string): DraftTuningJobStatus {
  if (state === "JOB_STATE_QUEUED" || state === "JOB_STATE_PENDING") return "PENDING";
  if (state === "JOB_STATE_RUNNING") return "RUNNING";
  if (state === "JOB_STATE_SUCCEEDED") return "SUCCEEDED";
  if (state === "JOB_STATE_CANCELLED" || state === "JOB_STATE_CANCELLING") return "CANCELLED";
  return "FAILED";
}

export function assertReleaseCanActivate(input: FineTuningEvaluationSummary & { jobStatus: DraftTuningJobStatus }) {
  if (input.jobStatus !== "SUCCEEDED") {
    throw new DraftFineTuningError("TUNING_JOB_NOT_SUCCEEDED", "완료된 튜닝 작업의 모델만 활성화할 수 있습니다.", 409);
  }
  if (input.comparisonCount < 20) {
    throw new DraftFineTuningError("MODEL_EVALUATION_INSUFFICIENT", "블라인드 비교 평가가 20건 이상 필요합니다.", 409);
  }
  if (input.candidateWinRate < 0.6) {
    throw new DraftFineTuningError("MODEL_WIN_RATE_TOO_LOW", "후보 모델 승리율이 60% 이상이어야 합니다.", 409);
  }
  if (input.criticalFailureCount > 0) {
    throw new DraftFineTuningError("MODEL_CRITICAL_FAILURE", "치명 품질 실패가 있는 모델은 활성화할 수 없습니다.", 409);
  }
}
