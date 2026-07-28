import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  assertReleaseCanActivate,
  buildGeminiTrainingJsonlRow,
  calculateFineTuningReadiness,
  DRAFT_FINE_TUNING_BASE_MODEL,
  DRAFT_FINE_TUNING_REGION,
  DraftFineTuningError,
  mapVertexTuningJobState,
  validateTrainingExampleInput,
  validateFineTuningEvaluation,
} from "@/lib/domain/draft-fine-tuning";
import {
  cancelVertexTuningJob,
  createVertexTuningJob,
  getVertexTuningJob,
  uploadTuningJsonl,
} from "@/lib/vertex-ai-tuning";

function parseObject(value: string | null | undefined) {
  try { return JSON.parse(value ?? "{}") as Record<string, unknown>; } catch { return {}; }
}

function evaluationSummary(value: string | null | undefined) {
  const parsed = parseObject(value);
  return {
    comparisonCount: Number(parsed.comparisonCount ?? 0),
    candidateWinRate: Number(parsed.candidateWinRate ?? 0),
    criticalFailureCount: Number(parsed.criticalFailureCount ?? 0),
  };
}

export async function getFineTuningDashboard() {
  const [examples, pendingCount, approvedTrainCount, approvedValidationCount, approvedRevisionCount, coveredIndustries, coveredStyles, datasets, jobs, releases, activeIndustries] = await Promise.all([
    prisma.draftTrainingExample.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.draftTrainingExample.count({ where: { status: "PENDING" } }),
    prisma.draftTrainingExample.count({ where: { status: "APPROVED", split: "TRAIN" } }),
    prisma.draftTrainingExample.count({ where: { status: "APPROVED", split: "VALIDATION" } }),
    prisma.draftTrainingExample.count({ where: { status: "APPROVED", sourceType: "ADMIN_REVISION" } }),
    prisma.draftTrainingExample.groupBy({ by: ["industry"], where: { status: "APPROVED", industry: { not: null } } }),
    prisma.draftTrainingExample.groupBy({ by: ["styleLabel"], where: { status: "APPROVED", styleLabel: { not: null } } }),
    prisma.draftTuningDataset.findMany({ orderBy: { version: "desc" }, take: 30 }),
    prisma.draftTuningJob.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { dataset: { select: { version: true } } } }),
    prisma.draftModelRelease.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { tuningJob: { select: { status: true, displayName: true } } } }),
    prisma.campaignDraftGuidance.findMany({ where: { campaign: { active: true }, industry: { not: null } }, select: { industry: true }, distinct: ["industry"] }),
  ]);
  const latestEvaluation = releases[0] ? evaluationSummary(releases[0].evaluationJson) : null;
  const readiness = calculateFineTuningReadiness({
    approvedTrainCount,
    approvedValidationCount,
    activeIndustryCount: Math.max(1, activeIndustries.length),
    coveredIndustryCount: coveredIndustries.length,
    coveredStyleCount: coveredStyles.length,
    targetStyleCount: 8,
    approvedRevisionCount,
    latestEvaluation,
  });
  return {
    readiness,
    counts: {
      pending: pendingCount,
      approvedTrain: approvedTrainCount,
      approvedValidation: approvedValidationCount,
    },
    examples: examples.map((item) => ({ ...item, qualityWarnings: JSON.parse(item.qualityWarningsJson) as string[] })),
    datasets,
    jobs,
    releases: releases.map((item) => ({ ...item, evaluation: evaluationSummary(item.evaluationJson) })),
    config: {
      baseModel: DRAFT_FINE_TUNING_BASE_MODEL,
      tuningRegion: DRAFT_FINE_TUNING_REGION,
      bucketConfigured: Boolean(process.env.VERTEX_AI_TUNING_BUCKET?.trim()),
    },
  };
}

export async function createManualTrainingExample(adminId: string, raw: Record<string, unknown>) {
  const validated = validateTrainingExampleInput({
    sourceType: "MANUAL",
    industry: typeof raw.industry === "string" ? raw.industry : null,
    inputText: typeof raw.inputText === "string" ? raw.inputText : "",
    outputText: typeof raw.outputText === "string" ? raw.outputText : "",
    split: raw.split === "VALIDATION" ? "VALIDATION" : "TRAIN",
  });
  const styleLabel = typeof raw.styleLabel === "string" ? raw.styleLabel.trim().slice(0, 80) || null : null;
  try {
    return await prisma.draftTrainingExample.create({ data: { ...validated, styleLabel, status: "PENDING", createdByAdminId: adminId } });
  } catch (error) {
    if (String(error).includes("Unique constraint")) throw new DraftFineTuningError("TRAINING_EXAMPLE_DUPLICATE", "이미 등록된 입력·출력 조합입니다.", 409);
    throw error;
  }
}

export async function updateTrainingExample(adminId: string, id: string, raw: Record<string, unknown>) {
  const status = raw.status;
  if (status !== "APPROVED" && status !== "REJECTED" && status !== "PENDING") {
    throw new DraftFineTuningError("TRAINING_STATUS_INVALID", "학습 자료 상태를 확인해 주세요.");
  }
  return prisma.draftTrainingExample.update({
    where: { id },
    data: status === "APPROVED"
      ? { status, approvedByAdminId: adminId, approvedAt: new Date() }
      : { status, approvedByAdminId: null, approvedAt: null },
  });
}

export async function importAdminRevisions(adminId: string) {
  const revisions = await prisma.campaignPreparedDraftRevision.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "asc" },
    take: 1_000,
    include: { campaign: { select: { name: true, business: { select: { name: true } }, draftGuidance: { select: { industry: true } } } } },
  });
  const drafts = await prisma.campaignPreparedDraft.findMany({
    where: { id: { in: revisions.map((item) => item.draftId) } },
    select: { id: true, toneLabel: true, structureLabel: true },
  });
  const draftMap = new Map(drafts.map((item) => [item.id, item]));
  let imported = 0;
  let skipped = 0;
  for (const revision of revisions) {
    try {
      const validated = validateTrainingExampleInput({
        sourceType: "ADMIN_REVISION",
        industry: revision.campaign.draftGuidance?.industry,
        inputText: `업종: ${revision.campaign.draftGuidance?.industry ?? "미분류"}\n매장: ${revision.campaign.business.name}\n캠페인: ${revision.campaign.name}\n수정 전 원고: ${revision.beforeText}`,
        outputText: revision.afterText,
        split: "TRAIN",
      });
      const draft = draftMap.get(revision.draftId);
      await prisma.draftTrainingExample.create({
        data: {
          ...validated,
          sourceRef: revision.id,
          styleLabel: draft ? `${draft.toneLabel} · ${draft.structureLabel}`.slice(0, 80) : null,
          status: "PENDING",
          createdByAdminId: adminId,
        },
      });
      imported += 1;
    } catch (error) {
      if (error instanceof DraftFineTuningError || String(error).includes("Unique constraint")) skipped += 1;
      else throw error;
    }
  }
  return { imported, skipped };
}

export async function buildFineTuningDataset(adminId: string) {
  const examples = await prisma.draftTrainingExample.findMany({ where: { status: "APPROVED" }, orderBy: { id: "asc" } });
  const train = examples.filter((item) => item.split === "TRAIN");
  const validation = examples.filter((item) => item.split === "VALIDATION");
  if (train.length < 100 || validation.length < 20) {
    throw new DraftFineTuningError("DATASET_NOT_READY", `승인된 훈련 100건·검증 20건이 필요합니다. 현재 ${train.length}/${validation.length}건입니다.`, 409);
  }
  const latest = await prisma.draftTuningDataset.aggregate({ _max: { version: true } });
  const version = (latest._max.version ?? 0) + 1;
  const manifestHash = createHash("sha256").update(examples.map((item) => `${item.id}:${item.contentHash}:${item.split}`).join("\n")).digest("hex");
  const dataset = await prisma.draftTuningDataset.create({
    data: {
      version, baseModel: DRAFT_FINE_TUNING_BASE_MODEL, manifestHash, createdByAdminId: adminId,
      trainingExampleCount: train.length, validationExampleCount: validation.length,
      examples: { create: examples.map((item, index) => ({ exampleId: item.id, split: item.split, position: index })) },
    },
  });
  try {
    const prefix = `review-drafts/dataset-v${version}-${manifestHash.slice(0, 12)}`;
    const [trainingGcsUri, validationGcsUri] = await Promise.all([
      uploadTuningJsonl(`${prefix}/train.jsonl`, `${train.map(buildGeminiTrainingJsonlRow).join("\n")}\n`),
      uploadTuningJsonl(`${prefix}/validation.jsonl`, `${validation.map(buildGeminiTrainingJsonlRow).join("\n")}\n`),
    ]);
    return prisma.draftTuningDataset.update({ where: { id: dataset.id }, data: { status: "READY", trainingGcsUri, validationGcsUri, readyAt: new Date() } });
  } catch (error) {
    await prisma.draftTuningDataset.update({ where: { id: dataset.id }, data: { status: "FAILED" } });
    throw error;
  }
}

export async function startFineTuningJob(adminId: string, datasetId: string) {
  const running = await prisma.draftTuningJob.count({ where: { status: { in: ["SUBMITTING", "PENDING", "RUNNING"] } } });
  if (running) throw new DraftFineTuningError("TUNING_JOB_ALREADY_RUNNING", "이미 진행 중인 튜닝 작업이 있습니다.", 409);
  const dataset = await prisma.draftTuningDataset.findUnique({ where: { id: datasetId } });
  if (!dataset || dataset.status !== "READY" || !dataset.trainingGcsUri || !dataset.validationGcsUri) {
    throw new DraftFineTuningError("DATASET_NOT_READY", "준비 완료된 데이터셋을 선택해 주세요.", 409);
  }
  const displayName = `review-draft-v${dataset.version}-${new Date().toISOString().slice(0, 10)}`;
  const local = await prisma.draftTuningJob.create({ data: { datasetId, displayName, baseModel: DRAFT_FINE_TUNING_BASE_MODEL, region: DRAFT_FINE_TUNING_REGION, createdByAdminId: adminId } });
  try {
    const vertex = await createVertexTuningJob({ displayName, trainingGcsUri: dataset.trainingGcsUri, validationGcsUri: dataset.validationGcsUri });
    if (typeof vertex.name !== "string") throw new Error("Vertex tuning job name missing");
    return prisma.draftTuningJob.update({ where: { id: local.id }, data: { vertexJobName: vertex.name, status: mapVertexTuningJobState(String(vertex.state ?? "JOB_STATE_QUEUED")) } });
  } catch (error) {
    await prisma.draftTuningJob.update({ where: { id: local.id }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "작업 생성 실패" } });
    throw error;
  }
}

function vertexResult(data: Record<string, unknown>) {
  const tuned = (data.tunedModel ?? {}) as Record<string, unknown>;
  const error = (data.error ?? {}) as Record<string, unknown>;
  return {
    status: mapVertexTuningJobState(String(data.state ?? "JOB_STATE_FAILED")),
    tunedModelName: typeof tuned.model === "string" ? tuned.model : null,
    tunedEndpointName: typeof tuned.endpoint === "string" ? tuned.endpoint : null,
    errorCode: typeof error.code === "string" || typeof error.code === "number" ? String(error.code) : null,
    errorMessage: typeof error.message === "string" ? error.message.slice(0, 1000) : null,
  };
}

export async function syncFineTuningJob(id: string) {
  const job = await prisma.draftTuningJob.findUnique({ where: { id } });
  if (!job?.vertexJobName) throw new DraftFineTuningError("TUNING_JOB_NOT_FOUND", "Vertex 튜닝 작업을 찾을 수 없습니다.", 404);
  const result = vertexResult(await getVertexTuningJob(job.vertexJobName));
  const updated = await prisma.draftTuningJob.update({ where: { id }, data: { ...result, completedAt: ["SUCCEEDED", "FAILED", "CANCELLED"].includes(result.status) ? new Date() : null } });
  if (result.status === "SUCCEEDED" && result.tunedModelName && result.tunedEndpointName) {
    await prisma.draftModelRelease.upsert({ where: { tuningJobId: id }, create: { tuningJobId: id, modelName: result.tunedModelName, endpointName: result.tunedEndpointName }, update: { modelName: result.tunedModelName, endpointName: result.tunedEndpointName } });
  }
  return updated;
}

export async function cancelFineTuningJob(id: string) {
  const job = await prisma.draftTuningJob.findUnique({ where: { id } });
  if (!job?.vertexJobName) throw new DraftFineTuningError("TUNING_JOB_NOT_FOUND", "Vertex 튜닝 작업을 찾을 수 없습니다.", 404);
  await cancelVertexTuningJob(job.vertexJobName);
  return prisma.draftTuningJob.update({ where: { id }, data: { status: "CANCELLED", completedAt: new Date() } });
}

export async function saveModelEvaluation(releaseId: string, raw: Record<string, unknown>) {
  const evaluation = validateFineTuningEvaluation({
    comparisonCount: raw.comparisonCount,
    candidateWins: raw.candidateWins,
    criticalFailureCount: raw.criticalFailureCount,
  });
  return prisma.draftModelRelease.update({ where: { id: releaseId }, data: { evaluationJson: JSON.stringify(evaluation) } });
}

export async function activateModelRelease(adminId: string, releaseId: string, confirmed: boolean) {
  if (!confirmed) throw new DraftFineTuningError("ACTIVATION_CONFIRMATION_REQUIRED", "운영 적용 확인이 필요합니다.");
  const release = await prisma.draftModelRelease.findUnique({ where: { id: releaseId }, include: { tuningJob: true } });
  if (!release) throw new DraftFineTuningError("MODEL_RELEASE_NOT_FOUND", "모델 후보를 찾을 수 없습니다.", 404);
  assertReleaseCanActivate({ jobStatus: release.tuningJob.status as never, ...evaluationSummary(release.evaluationJson) });
  return prisma.$transaction(async (tx) => {
    await tx.draftModelRelease.updateMany({ where: { status: "ACTIVE" }, data: { status: "RETIRED" } });
    return tx.draftModelRelease.update({ where: { id: releaseId }, data: { status: "ACTIVE", activatedByAdminId: adminId, activatedAt: new Date() } });
  });
}
