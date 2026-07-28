import { isVertexAiConfigured, requestVertexAi, requestVertexTunedEndpoint } from "@/lib/vertex-ai";
import { prisma } from "@/lib/db";

export type ReviewDraftProvider = "vertex" | "gemini" | "template";

type ProviderEnvironment = Record<string, string | undefined>;

export class ReviewDraftProviderConfigurationError extends Error {
  constructor(public readonly provider: string) {
    super(`지원하지 않는 원고 생성 공급자입니다: ${provider}`);
    this.name = "ReviewDraftProviderConfigurationError";
  }
}

export function resolveReviewDraftProvider(env: ProviderEnvironment = process.env): ReviewDraftProvider {
  const value = env.REVIEW_DRAFT_PROVIDER?.trim() || "vertex";
  if (value === "vertex" || value === "gemini" || value === "template") return value;
  throw new ReviewDraftProviderConfigurationError(value);
}

export function isReviewDraftProviderConfigured(env: ProviderEnvironment = process.env) {
  try {
    const provider = resolveReviewDraftProvider(env);
    if (provider === "template") return true;
    if (provider === "vertex") return isVertexAiConfigured(env);
    return Boolean(env.GEMINI_API_KEY?.trim());
  } catch {
    return false;
  }
}

export async function requestGeminiGeneration({
  provider,
  model,
  apiKey,
  method,
  body,
  timeoutMs,
}: {
  provider: ReviewDraftProvider;
  model: string;
  apiKey?: string;
  method: "generateContent" | "streamGenerateContent";
  body: unknown;
  timeoutMs: number;
}) {
  if (provider === "vertex") {
    const active = await prisma.draftModelRelease.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { activatedAt: "desc" },
      select: { endpointName: true },
    });
    if (active) return requestVertexTunedEndpoint(active.endpointName, method, body, timeoutMs);
    return requestVertexAi(method, body, timeoutMs, {
      ...process.env,
      REVIEW_DRAFT_MODEL: model,
    });
  }
  if (provider !== "gemini" || !apiKey) {
    throw new Error("원고 생성 AI 제공자 설정을 확인해 주세요.");
  }

  const endpoint = method === "streamGenerateContent" ? "streamGenerateContent?alt=sse" : "generateContent";
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${endpoint}${method === "generateContent" ? `?key=${encodeURIComponent(apiKey)}` : `&key=${encodeURIComponent(apiKey)}`}`,
    {
      method: "POST",
      headers: {
        ...(method === "streamGenerateContent" ? { accept: "text/event-stream" } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
}
