import { prisma } from "@/lib/db";
import { analyzeReviewProof } from "@/lib/domain/review-proof-analysis";
import {
  REVIEWER_ASSIGNMENT_SOURCE,
  REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED,
  submitReviewerCampaignProof,
} from "@/lib/domain/reviewer-campaigns";
import { getPrivateReviewProof } from "@/lib/review-proof-storage";
import { recordOperationalError } from "@/lib/error-logging";

const REVIEW_PROOF_ANALYSIS_JOB = "REVIEW_PROOF_ANALYSIS";
const MAX_JOB_ATTEMPTS = 4;

function retryAt(attempts: number) {
  const delayMs = Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + delayMs);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : "Unknown job error";
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

export async function processOperationalJobs(limit = 10) {
  const now = new Date();
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
      const result =
        job.type === REVIEW_PROOF_ANALYSIS_JOB
          ? await processReviewProofAnalysis(claimedJob)
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
