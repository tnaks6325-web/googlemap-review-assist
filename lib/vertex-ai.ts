import { SignJWT, importPKCS8 } from "jose";

export const DEFAULT_VERTEX_AI_MODEL = "gemini-2.5-flash";
export const DEFAULT_VERTEX_AI_LOCATION = "global";

const VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

type VertexEnvironment = Record<string, string | undefined>;

export interface VertexAiConfig { projectId: string; location: string; model: string; }
export interface VertexServiceAccount { type: "service_account"; project_id: string; client_email: string; private_key: string; }
export type VertexAiMethod = "generateContent" | "streamGenerateContent";

export class VertexAiConfigurationError extends Error {
  constructor(
    public readonly code: "VERTEX_PROJECT_REQUIRED" | "VERTEX_PROJECT_INVALID" | "VERTEX_LOCATION_INVALID" | "VERTEX_MODEL_INVALID" | "VERTEX_CREDENTIALS_INVALID" | "VERTEX_ACCESS_TOKEN_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "VertexAiConfigurationError";
  }
}

function cleanEnvironmentValue(value: string | undefined) { return value?.trim() ?? ""; }

export function resolveVertexAiConfig(env: VertexEnvironment = process.env): VertexAiConfig {
  const projectId = cleanEnvironmentValue(env.VERTEX_AI_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT);
  const location = cleanEnvironmentValue(env.VERTEX_AI_LOCATION) || DEFAULT_VERTEX_AI_LOCATION;
  const model = cleanEnvironmentValue(env.REVIEW_DRAFT_MODEL) || DEFAULT_VERTEX_AI_MODEL;
  if (!projectId) throw new VertexAiConfigurationError("VERTEX_PROJECT_REQUIRED", "Vertex AI 프로젝트 설정이 필요합니다.");
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(projectId)) throw new VertexAiConfigurationError("VERTEX_PROJECT_INVALID", "Vertex AI 프로젝트 ID 설정을 확인해 주세요.");
  if (!/^(?:global|[a-z][a-z0-9-]{1,62})$/u.test(location)) throw new VertexAiConfigurationError("VERTEX_LOCATION_INVALID", "Vertex AI 리전 설정을 확인해 주세요.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/u.test(model)) throw new VertexAiConfigurationError("VERTEX_MODEL_INVALID", "Vertex AI 모델 설정을 확인해 주세요.");
  return { projectId, location, model };
}

function decodeBase64(value: string) { return Buffer.from(value, "base64").toString("utf8"); }

export function parseVertexServiceAccount(encoded: string): VertexServiceAccount {
  try {
    const parsed = JSON.parse(decodeBase64(encoded)) as Partial<VertexServiceAccount>;
    if (parsed.type !== "service_account" || typeof parsed.project_id !== "string" || typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string" || !parsed.client_email.trim() || !parsed.private_key.includes("BEGIN PRIVATE KEY")) throw new Error("invalid service account fields");
    return parsed as VertexServiceAccount;
  } catch {
    throw new VertexAiConfigurationError("VERTEX_CREDENTIALS_INVALID", "Vertex AI 서비스 계정 설정을 확인해 주세요.");
  }
}

export function buildVertexAiUrl(config: VertexAiConfig, method: VertexAiMethod) {
  const origin = config.location === "global" ? "https://aiplatform.googleapis.com" : `https://${config.location}-aiplatform.googleapis.com`;
  const path = ["v1/projects", encodeURIComponent(config.projectId), "locations", encodeURIComponent(config.location), "publishers/google/models", `${encodeURIComponent(config.model)}:${method}`].join("/");
  return `${origin}/${path}${method === "streamGenerateContent" ? "?alt=sse" : ""}`;
}

let cachedAccessToken: { token: string; expiresAt: number; clientEmail: string } | null = null;

export async function getVertexAccessToken(env: VertexEnvironment = process.env) {
  resolveVertexAiConfig(env);
  const encodedCredentials = cleanEnvironmentValue(env.VERTEX_AI_SERVICE_ACCOUNT_BASE64);
  if (!encodedCredentials) throw new VertexAiConfigurationError("VERTEX_CREDENTIALS_INVALID", "Vertex AI 서비스 계정 설정이 필요합니다.");
  const credentials = parseVertexServiceAccount(encodedCredentials);
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken?.clientEmail === credentials.client_email && cachedAccessToken.expiresAt - 60 > now) return cachedAccessToken.token;
  const privateKey = await importPKCS8(credentials.private_key, "RS256");
  const assertion = await new SignJWT({ scope: VERTEX_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(credentials.client_email).setSubject(credentials.client_email)
    .setAudience(GOOGLE_OAUTH_TOKEN_URL).setIssuedAt(now).setExpirationTime(now + 3_600).sign(privateKey);
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => null) as { access_token?: unknown; expires_in?: unknown } | null;
  if (!response.ok || typeof data?.access_token !== "string" || !data.access_token) throw new VertexAiConfigurationError("VERTEX_ACCESS_TOKEN_REQUIRED", "Vertex AI 인증 토큰을 발급하지 못했습니다.");
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3_600;
  cachedAccessToken = { token: data.access_token, expiresAt: now + Math.max(60, Math.min(expiresIn, 3_600)), clientEmail: credentials.client_email };
  return data.access_token;
}

export async function sendVertexAiRequest({ config, method, accessToken, body, fetchImpl = fetch, timeoutMs }: { config: VertexAiConfig; method: VertexAiMethod; accessToken: string; body: unknown; fetchImpl?: typeof fetch; timeoutMs: number }) {
  const streaming = method === "streamGenerateContent";
  return fetchImpl(buildVertexAiUrl(config, method), { method: "POST", headers: { ...(streaming ? { accept: "text/event-stream" } : {}), authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
}

export async function requestVertexAi(method: VertexAiMethod, body: unknown, timeoutMs: number, env: VertexEnvironment = process.env) {
  return sendVertexAiRequest({ config: resolveVertexAiConfig(env), method, accessToken: await getVertexAccessToken(env), body, timeoutMs });
}

export function buildVertexTunedEndpointUrl(endpointName: string, method: VertexAiMethod) {
  const match = endpointName.match(/^projects\/[^/]+\/locations\/([^/]+)\/endpoints\/[^/]+$/u);
  if (!match) throw new VertexAiConfigurationError("VERTEX_MODEL_INVALID", "튜닝 모델 엔드포인트 형식이 올바르지 않습니다.");
  const location = match[1];
  const origin = location === "us" || location === "eu" ? `https://aiplatform.${location}.rep.googleapis.com` : `https://${location}-aiplatform.googleapis.com`;
  return `${origin}/v1/${endpointName}:${method}${method === "streamGenerateContent" ? "?alt=sse" : ""}`;
}

export async function requestVertexTunedEndpoint(endpointName: string, method: VertexAiMethod, body: unknown, timeoutMs: number, env: VertexEnvironment = process.env) {
  const accessToken = await getVertexAccessToken(env);
  return fetch(buildVertexTunedEndpointUrl(endpointName, method), { method: "POST", headers: { ...(method === "streamGenerateContent" ? { accept: "text/event-stream" } : {}), authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
}

export function isVertexAiConfigured(env: VertexEnvironment = process.env) {
  try { resolveVertexAiConfig(env); return Boolean(cleanEnvironmentValue(env.VERTEX_AI_SERVICE_ACCOUNT_BASE64)); } catch { return false; }
}
