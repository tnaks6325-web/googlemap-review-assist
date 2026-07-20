import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

export type ErrorSeverity = "WARNING" | "ERROR" | "CRITICAL";
export type ErrorSource = "SERVER" | "BROWSER" | "JOB" | "INTEGRATION";

export interface ErrorNarrativeInput {
  workflow: string;
  stage: string;
  situation: string;
  cause: string;
  impact: string;
  action: string;
}

export interface OperationalErrorInput extends ErrorNarrativeInput {
  severity: ErrorSeverity;
  source: ErrorSource;
  code: string;
  title: string;
  error?: unknown;
  digest?: string | null;
  route?: string | null;
  method?: string | null;
  requestId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
}

export interface OperationalErrorFilters {
  severity?: ErrorSeverity | "ALL";
  source?: ErrorSource | "ALL";
  status?: "OPEN" | "RESOLVED" | "ALL";
  workflow?: string;
}

const MAX_TEXT = 1_000;
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+(?:\s+[^\s,;]+)?/gi, "[인증정보 제거]"],
  [/\bbearer\s+[a-z0-9._~+/-]+=*/gi, "[인증정보 제거]"],
  [/\b(?:password|passwd|pwd|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "[민감정보 제거]"],
  [/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi, "[이메일 제거]"],
  [/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, "[전화번호 제거]"],
  [/\b\d{2,6}[-\s]\d{2,6}[-\s]\d{2,8}\b/g, "[번호정보 제거]"],
];

function bounded(value: unknown, fallback = "") {
  const text = typeof value === "string" ? value.trim() : fallback;
  return text.slice(0, MAX_TEXT);
}

export function sanitizeErrorText(value: unknown) {
  let text = bounded(value, "알 수 없는 오류");
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text.slice(0, MAX_TEXT);
}

function safeRoute(value?: string | null) {
  if (!value) return null;
  return sanitizeErrorText(value.split("?")[0]).slice(0, 300);
}

function technicalDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      technicalName: sanitizeErrorText(error.name).slice(0, 120),
      technicalMessage: sanitizeErrorText(error.message),
    };
  }
  return {
    technicalName: "UnknownError",
    technicalMessage: sanitizeErrorText(error),
  };
}

export function buildErrorNarrative(input: ErrorNarrativeInput) {
  return `${bounded(input.workflow)} 업무에서 ${bounded(input.stage)} 단계가 완료되지 않았습니다. ${bounded(input.situation)} 원인: ${bounded(input.cause)} 영향: ${bounded(input.impact)} 권장 조치: ${bounded(input.action)}`;
}

function fingerprintFor(input: OperationalErrorInput, route: string | null) {
  return createHash("sha256")
    .update(
      [
        bounded(input.code),
        bounded(input.workflow),
        bounded(input.stage),
        route ?? "",
        bounded(input.entityType),
        bounded(input.entityId),
      ].join("|"),
    )
    .digest("hex");
}

function safeMetadata(metadata: OperationalErrorInput["metadata"]) {
  if (!metadata) return null;
  const entries = Object.entries(metadata).slice(0, 20).map(([key, value]) => [
    sanitizeErrorText(key).slice(0, 80),
    typeof value === "string" ? sanitizeErrorText(value).slice(0, 300) : value,
  ]);
  return JSON.stringify(Object.fromEntries(entries)).slice(0, 4_000);
}

export async function recordOperationalError(input: OperationalErrorInput) {
  const route = safeRoute(input.route);
  const details = technicalDetails(input.error);
  const now = new Date();
  const data = {
    severity: input.severity,
    source: input.source,
    workflow: bounded(input.workflow),
    stage: bounded(input.stage),
    code: bounded(input.code).slice(0, 120),
    title: bounded(input.title),
    situation: bounded(input.situation),
    cause: bounded(input.cause),
    impact: bounded(input.impact),
    action: bounded(input.action),
    narrative: buildErrorNarrative(input),
    technicalName: details.technicalName,
    technicalMessage: details.technicalMessage,
    digest: input.digest ? sanitizeErrorText(input.digest).slice(0, 200) : null,
    route,
    method: input.method ? bounded(input.method).slice(0, 12).toUpperCase() : null,
    requestId: input.requestId ? sanitizeErrorText(input.requestId).slice(0, 200) : null,
    entityType: input.entityType ? bounded(input.entityType).slice(0, 80) : null,
    entityId: input.entityId ? sanitizeErrorText(input.entityId).slice(0, 200) : null,
    metadataJson: safeMetadata(input.metadata),
  };

  try {
    return await prisma.operationalError.upsert({
      where: { fingerprint: fingerprintFor(input, route) },
      create: {
        fingerprint: fingerprintFor(input, route),
        ...data,
        firstOccurredAt: now,
        lastOccurredAt: now,
      },
      update: {
        ...data,
        status: "OPEN",
        occurrenceCount: { increment: 1 },
        lastOccurredAt: now,
        resolvedAt: null,
      },
    });
  } catch (loggingError) {
    const fallback = technicalDetails(loggingError);
    console.error("operational_error_log_failed", {
      code: data.code,
      workflow: data.workflow,
      stage: data.stage,
      error: fallback.technicalName,
    });
    return null;
  }
}

export async function cleanupOperationalErrors(retentionDays = 30) {
  const safeDays = Math.max(1, Math.min(retentionDays, 365));
  return prisma.operationalError.deleteMany({
    where: { lastOccurredAt: { lt: new Date(Date.now() - safeDays * 24 * 60 * 60 * 1_000) } },
  });
}

export async function listOperationalErrors(filters: OperationalErrorFilters = {}) {
  await cleanupOperationalErrors().catch(() => undefined);
  return prisma.operationalError.findMany({
    where: {
      ...(filters.severity && filters.severity !== "ALL" ? { severity: filters.severity } : {}),
      ...(filters.source && filters.source !== "ALL" ? { source: filters.source } : {}),
      ...(filters.status && filters.status !== "ALL" ? { status: filters.status } : {}),
      ...(filters.workflow ? { workflow: filters.workflow.slice(0, 1_000) } : {}),
    },
    orderBy: { lastOccurredAt: "desc" },
    take: 200,
  });
}

export async function getOperationalErrorSummary() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [open, todayCount, critical] = await Promise.all([
    prisma.operationalError.count({ where: { status: "OPEN" } }),
    prisma.operationalError.count({ where: { lastOccurredAt: { gte: today } } }),
    prisma.operationalError.count({ where: { status: "OPEN", severity: "CRITICAL" } }),
  ]);
  return { open, today: todayCount, critical };
}

export async function resolveOperationalError(id: string) {
  const cleanId = id.trim().slice(0, 200);
  if (!cleanId) return null;
  const resolvedAt = new Date();
  const result = await prisma.operationalError.updateMany({
    where: { id: cleanId },
    data: { status: "RESOLVED", resolvedAt },
  });
  return result.count === 1 ? { id: cleanId, status: "RESOLVED" as const, resolvedAt } : null;
}
