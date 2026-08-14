import { prisma } from "@/lib/db";
import { analyzeReviewProof } from "@/lib/domain/review-proof-analysis";
import {
  REVIEWER_ASSIGNMENT_SOURCE,
  REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED,
  submitReviewerCampaignProof,
} from "@/lib/domain/reviewer-campaigns";
import { getPrivateReviewProof } from "@/lib/review-proof-storage";
import { recordOperationalError } from "@/lib/error-logging";
import {
  CAMPAIGN_AUTOMATION_DISCOVERY_JOB,
  CAMPAIGN_AUTOMATION_SETUP_JOB,
} from "@/lib/domain/campaign-automation-jobs";
import { isCampaignAutomationEnabled, isManualCampaignAutomationRun } from "@/lib/domain/campaign-automation-control";
import { processCampaignAutomationDiscoveryJob } from "@/lib/domain/campaign-automation-discovery-worker";
import {
  setupCampaignWithCurrentProviders,
  type CampaignAutomationSetupResult,
} from "@/lib/domain/campaign-automation-setup";

const REVIEW_PROOF_ANALYSIS_JOB = "REVIEW_PROOF_ANALYSIS";
const MAX_JOB_ATTEMPTS = 4;
const JOB_LEASE_TIMEOUT_MS = 5 * 60_000;

function retryAt(attempts: number) {
  const delayMs = Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + delayMs);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : "Unknown job error";
}

async function settleCampaignAutomationRun(runId: string) {
  const states = await prisma.campaignAutomationRun.findMany({
    where: { automationRunId: runId },
    select: { status: true },
  });
  if (!states.length) return;
  const waiting = states.some((state) => ["QUEUED", "PROCESSING", "RETRY"].includes(state.status));
  if (waiting) {
    await prisma.automationRun.update({ where: { id: runId }, data: { status: "RUNNING", completedAt: null } });
    return;
  }
  const degraded = states.some((state) => state.status !== "READY");
  await prisma.automationRun.update({
    where: { id: runId },
    data: { status: degraded ? "DEGRADED" : "COMPLETED", completedAt: new Date() },
  });
}

export async function enqueueReviewProofAnalysis({ assignmentId }: { assignmentId: string }) {
  const cleanAssignmentId = assignmentId.trim();
  if (!cleanAssignmentId) return null;
  return prisma.operationalJob.upsert({
    where: { dedupeKey: `review-proof-analysis:${cleanAssignmentId}` },
    create: {
      type: REVIEW_PROOF_ANALYSIS_JOB,
      dedupeKey: `review-proof-analysis:${cleanAssignmentId}`,
      payloadJson: JSON.stringify({ assignmentId: cleanAssignmentId }),
      maxAttempts: MAX_JOB_ATTEMPTS,
    },
    update: {},
  });
}

async function processReviewProofAnalysis(job: {
  id: string;
  attempts: number;
  maxAttempts: number;
  payloadJson: string;
}) {
  const payload = JSON.parse(job.payloadJson) as { assignmentId?: string };
  const assignmentId = payload.assignmentId?.trim();
  if (!assignmentId) throw new Error("Missing review proof assignment id");

  const receipt = await prisma.receipt.findUnique({
    where: { id: assignmentId },
    include: { business: true },
  });
  if (
    !receipt ||
    receipt.source !== REVIEWER_ASSIGNMENT_SOURCE ||
    receipt.status !== REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED ||
    !receipt.reviewProofImageUrl ||
    !receipt.reviewProofMimeType ||
    !receipt.reviewDraftText
  ) {
    return "SKIPPED" as const;
  }

  const storedProof = await getPrivateReviewProof(receipt.reviewProofImageUrl);
  const imageBytes = new Uint8Array(await new Response(storedProof.stream).arrayBuffer());
  const analysis = await analyzeReviewProof({
    draftText: receipt.reviewDraftText,
    imageBytes,
    mimeType: receipt.reviewProofMimeType,
    expectedPlaceName: receipt.business.name,
  });

  if (analysis.status === "UNAVAILABLE") {
    if (job.attempts >= job.maxAttempts) return "UNAVAILABLE" as const;
    throw new Error("OCR analysis unavailable");
  }

  await submitReviewerCampaignProof(receipt.reviewerId, receipt.id, {
    screenshotUrl: receipt.reviewProofImageUrl,
    screenshotMimeType: receipt.reviewProofMimeType,
    screenshotOriginalName: receipt.reviewProofOriginalName ?? "review-proof",
    draftText: receipt.reviewDraftText,
    analysis,
    reprocess: true,
  });
  return "COMPLETED" as const;
}

export async function processCampaignAutomationSetupJob(
  job: { id: string; payloadJson: string },
  setupCampaign: (campaignId: string) => Promise<CampaignAutomationSetupResult> = setupCampaignWithCurrentProviders,
) {
  const payload = JSON.parse(job.payloadJson) as { runId?: string; runKey?: string; campaignId?: string };
  const runId = payload.runId?.trim();
  const campaignId = payload.campaignId?.trim();
  if (!runId || !campaignId) throw new Error("Missing campaign automation setup payload");

  if (payload.runKey && !(await isCampaignAutomationEnabled()) && !isManualCampaignAutomationRun(payload.runKey)) {
    return "SKIPPED" as const;
  }

  const result = await setupCampaign(campaignId);
  const completedAt = new Date();
  if (result.status === "NEEDS_REVIEW") {
    await prisma.campaignAutomationRun.updateMany({
      where: { automationRunId: runId, campaignId },
      data: {
        status: "NEEDS_REVIEW",
        stage: result.reason,
        completedAt,
        lockedAt: null,
        lastError: null,
      },
    });
    await settleCampaignAutomationRun(runId);
    return "NEEDS_REVIEW" as const;
  }

  await prisma.campaignAutomationRun.updateMany({
    where: { automationRunId: runId, campaignId },
    data: { status: "READY", stage: "READY", completedAt, lockedAt: null, lastError: null },
  });
  await settleCampaignAutomationRun(runId);
  return "COMPLETED" as const;
}

export async function recordCampaignAutomationSetupFailure(
  job: { payloadJson: string; attempts?: number },
  exhausted: boolean,
  error: unknown,
) {
  let payload: { runId?: string; campaignId?: string };
  try {
    payload = JSON.parse(job.payloadJson) as { runId?: string; campaignId?: string };
  } catch {
    return;
  }
  const runId = payload.runId?.trim();
  const campaignId = payload.campaignId?.trim();
  if (!runId || !campaignId) return;
  const message = errorMessage(error);
  await prisma.campaignAutomationRun.updateMany({
    where: { automationRunId: runId, campaignId },
    data: exhausted
      ? { status: "FAILED", stage: "FAILED", completedAt: new Date(), lockedAt: null, lastError: message }
      : {
          status: "RETRY",
          nextRetryAt: retryAt(Math.max(1, job.attempts ?? 1)),
          lockedAt: null,
          lastError: message,
        },
  });
  await settleCampaignAutomationRun(runId);
}

export async function processOperationalJobs(limit = 10) {
  const now = new Date();
  const expiredLeaseAt = new Date(now.getTime() - JOB_LEASE_TIMEOUT_MS);
  await prisma.operationalJob.updateMany({
    where: {
      status: "PROCESSING",
      OR: [{ lockedAt: { lt: expiredLeaseAt } }, { lockedAt: null }],
    },
    data: {
      status: "RETRY",
      lockedAt: null,
      runAt: now,
      lastError: "Job lease expired before completion",
    },
  });
  const jobs = await prisma.operationalJob.findMany({
    where: { status: { in: ["PENDING", "RETRY"] }, runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: Math.max(1, Math.min(limit, 25)),
  });
  const summary = { claimed: 0, completed: 0, retrying: 0, skipped: 0, unavailable: 0 };

  for (const job of jobs) {
    const claim = await prisma.operationalJob.updateMany({
      where: { id: job.id, status: { in: ["PENDING", "RETRY"] } },
      data: { status: "PROCESSING", lockedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claim.count !== 1) continue;
    summary.claimed += 1;

    const claimedJob = { ...job, attempts: job.attempts + 1 };
    try {
      if (job.type === CAMPAIGN_AUTOMATION_DISCOVERY_JOB && !(await isCampaignAutomationEnabled())) {
        summary.skipped += 1;
        await prisma.operationalJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED", completedAt: new Date(), lockedAt: null, lastError: "Campaign automation is disabled" },
        });
        continue;
      }
      const result =
        job.type === REVIEW_PROOF_ANALYSIS_JOB
          ? await processReviewProofAnalysis(claimedJob)
          : job.type === CAMPAIGN_AUTOMATION_DISCOVERY_JOB
            ? await processCampaignAutomationDiscoveryJob(claimedJob)
          : job.type === CAMPAIGN_AUTOMATION_SETUP_JOB
            ? await processCampaignAutomationSetupJob(claimedJob)
          : ("SKIPPED" as const);
      if (result === "SKIPPED") summary.skipped += 1;
      else if (result === "UNAVAILABLE") summary.unavailable += 1;
      else summary.completed += 1;
      await prisma.operationalJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", completedAt: new Date(), lockedAt: null },
      });
    } catch (error) {
      const exhausted = claimedJob.attempts >= claimedJob.maxAttempts;
      if (exhausted) summary.unavailable += 1;
      else summary.retrying += 1;
      if (job.type === CAMPAIGN_AUTOMATION_SETUP_JOB) {
        await recordCampaignAutomationSetupFailure(claimedJob, exhausted, error);
      }
      await prisma.operationalJob.update({
        where: { id: job.id },
        data: exhausted
          ? { status: "FAILED", lockedAt: null, lastError: errorMessage(error) }
          : { status: "RETRY", lockedAt: null, runAt: retryAt(claimedJob.attempts), lastError: errorMessage(error) },
      });
      await recordOperationalError({
        severity: exhausted ? "CRITICAL" : "WARNING",
        source: "JOB",
        workflow: "리뷰 인증 자동 분석",
        stage: exhausted ? "최종 재시도" : "배치 재시도",
        code: exhausted ? "OPERATIONAL_JOB_FAILED" : "OPERATIONAL_JOB_RETRY",
        title: exhausted
          ? "리뷰 인증 자동 분석이 모든 재시도 후 실패했습니다."
          : "리뷰 인증 자동 분석이 실패하여 다시 시도합니다.",
        situation: "백그라운드에서 제출된 리뷰 인증 이미지를 자동 분석하던 중이었습니다.",
        cause: "저장된 이미지를 읽거나 OCR 분석 결과를 저장하는 과정에서 오류가 발생했습니다.",
        impact: exhausted
          ? "해당 인증 건은 자동 분석이 완료되지 않아 관리자 확인이 필요합니다."
          : "자동 분석이 지연되며 예약된 시간에 다시 실행됩니다.",
        action: exhausted
          ? "오류 기술 정보와 인증 이미지를 확인한 뒤 관리자 화면에서 직접 처리해 주세요."
          : "추가 조치는 필요하지 않으며 반복 실패 여부를 확인해 주세요.",
        entityType: "operationalJob",
        entityId: job.id,
        error,
        metadata: { jobType: job.type, attempts: claimedJob.attempts },
      });
    }
  }

  return summary;
}
