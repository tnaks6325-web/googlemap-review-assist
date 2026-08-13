import { DRAFT_FINE_TUNING_BASE_MODEL, DRAFT_FINE_TUNING_REGION } from "@/lib/domain/draft-fine-tuning";
import { getVertexAccessToken, resolveVertexAiConfig } from "@/lib/vertex-ai";

type Env = Record<string, string | undefined>;

export class VertexTuningConfigurationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "VertexTuningConfigurationError"; }
}

function tuningConfig(env: Env = process.env) {
  const { projectId } = resolveVertexAiConfig(env);
  const bucket = env.VERTEX_AI_TUNING_BUCKET?.trim() ?? "";
  if (!/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/u.test(bucket)) throw new VertexTuningConfigurationError("VERTEX_TUNING_BUCKET_REQUIRED", "VERTEX_AI_TUNING_BUCKET 환경변수에 전용 Cloud Storage 버킷 이름을 등록해 주세요.");
  return { projectId, bucket };
}

export function buildVertexTuningJobUrl(projectId: string, jobName?: string) {
  const base = `https://${DRAFT_FINE_TUNING_REGION}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${DRAFT_FINE_TUNING_REGION}/tuningJobs`;
  return jobName ? `https://${DRAFT_FINE_TUNING_REGION}-aiplatform.googleapis.com/v1/${jobName}` : base;
}

async function googleRequest(url: string, init: RequestInit, env: Env) {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${await getVertexAccessToken(env)}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000) });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const nested = data?.error as Record<string, unknown> | undefined;
    throw new VertexTuningConfigurationError(typeof nested?.status === "string" ? nested.status : "VERTEX_TUNING_REQUEST_FAILED", typeof nested?.message === "string" ? nested.message : "Vertex AI 요청에 실패했습니다.");
  }
  return data ?? {};
}

export async function uploadTuningJsonl(objectName: string, jsonl: string, env: Env = process.env) {
  const { bucket } = tuningConfig(env);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  await googleRequest(url, { method: "POST", headers: { "content-type": "application/jsonl; charset=utf-8" }, body: jsonl }, env);
  return `gs://${bucket}/${objectName}`;
}

export async function createVertexTuningJob(input: { displayName: string; trainingGcsUri: string; validationGcsUri: string }, env: Env = process.env) {
  const { projectId } = tuningConfig(env);
  return googleRequest(buildVertexTuningJobUrl(projectId), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseModel: DRAFT_FINE_TUNING_BASE_MODEL, displayName: input.displayName, supervisedTuningSpec: { trainingDatasetUri: input.trainingGcsUri, validationDatasetUri: input.validationGcsUri } }) }, env);
}

export async function getVertexTuningJob(jobName: string, env: Env = process.env) {
  return googleRequest(buildVertexTuningJobUrl(tuningConfig(env).projectId, jobName), { method: "GET" }, env);
}

export async function cancelVertexTuningJob(jobName: string, env: Env = process.env) {
  return googleRequest(`${buildVertexTuningJobUrl(tuningConfig(env).projectId, jobName)}:cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, env);
}
