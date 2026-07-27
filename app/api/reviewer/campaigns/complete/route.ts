import { checkOrigin } from "@/lib/auth/origin";
import { getReviewerId } from "@/lib/auth/session";
import {
  getReviewerCampaignProofContext,
  ReviewerCampaignError,
  submitReviewerCampaignProof,
} from "@/lib/domain/reviewer-campaigns";
import { analyzeReviewProof, type ReviewProofAnalysis } from "@/lib/domain/review-proof-analysis";
import { enqueueReviewProofAnalysis } from "@/lib/domain/operational-jobs";
import { getReviewerSettlementProfile } from "@/lib/domain/settlement";
import { recordOperationalError } from "@/lib/error-logging";
import { err, ok } from "@/lib/http";
import {
  ReviewProofStorageError,
  deleteReviewProof,
  uploadReviewProof,
  validateReviewProofImage,
} from "@/lib/review-proof-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);

  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요.", 401);

  let uploadedProofUrl: string | null = null;
  try {
    const form = await req.formData();
    const assignmentId = String(form.get("assignmentId") ?? "");
    const rawResubmissionNote = form.get("resubmissionNote");
    if (rawResubmissionNote !== null && typeof rawResubmissionNote !== "string") {
      return err("INVALID_RESUBMISSION_NOTE", "보완 내용을 확인해 주세요.", 400);
    }
    const resubmissionNote = rawResubmissionNote?.trim() ?? "";
    if (resubmissionNote.length > 500) {
      return err("INVALID_RESUBMISSION_NOTE", "보완 내용은 500자 이내로 입력해 주세요.", 400);
    }
    const screenshot = form.get("screenshot");
    if (!(screenshot instanceof File)) {
      return err("MISSING_SCREENSHOT", "구글맵 리뷰 캡처본을 첨부해 주세요.", 400);
    }

    const proofContext = await getReviewerCampaignProofContext(reviewerId, assignmentId);
    const expectedDraftText = proofContext.reviewDraftText;
    if (!expectedDraftText) {
      return err("MISSING_REVIEW_DRAFT", "저장된 리뷰 원고가 없습니다. 원고를 먼저 생성해 주세요.", 409);
    }

    const imageBytes = new Uint8Array(await screenshot.arrayBuffer());
    const image = validateReviewProofImage(screenshot, imageBytes);
    const analysisPromise: Promise<ReviewProofAnalysis> = analyzeReviewProof({
      draftText: expectedDraftText,
      imageBytes,
      mimeType: image.mimeType,
      expectedPlaceName: proofContext.businessName,
      mockText: typeof form.get("mockOcrText") === "string" ? String(form.get("mockOcrText")) : undefined,
    }).catch(() => ({
      status: "UNAVAILABLE",
      provider: "ocr",
      extractedText: "",
      similarity: 0,
      reason: "OCR_FAILED",
      confidence: 0,
    }));
    const [screenshotUrl, analysis] = await Promise.all([
      uploadReviewProof({
        assignmentId,
        bytes: imageBytes,
        mimeType: image.mimeType,
      }),
      analysisPromise,
    ]);
    uploadedProofUrl = screenshotUrl;

    const result = await submitReviewerCampaignProof(reviewerId, assignmentId, {
      screenshotUrl,
      screenshotMimeType: image.mimeType,
      screenshotOriginalName: screenshot.name || "review-proof",
      draftText: expectedDraftText,
      analysis,
      resubmissionNote,
    });
    uploadedProofUrl = null;
    if (analysis.status === "UNAVAILABLE") {
      await enqueueReviewProofAnalysis({ assignmentId }).catch(() => undefined);
    }
    const profile = await getReviewerSettlementProfile(reviewerId);
    return ok({
      ...result,
      settlementProfileRequired: profile.settlementProfileRequired,
    });
  } catch (e) {
    if (uploadedProofUrl) {
      await deleteReviewProof(uploadedProofUrl).catch(() => undefined);
    }
    if (e instanceof ReviewProofStorageError) return err(e.code, e.message, e.status);
    if (e instanceof ReviewerCampaignError) return err(e.code, e.message, e.status);
    await recordOperationalError({
      severity: "ERROR",
      source: "SERVER",
      workflow: "리뷰 인증 제출",
      stage: uploadedProofUrl ? "인증 이미지 정리와 제출 저장" : "인증 이미지 분석과 업로드",
      code: "COMPLETE_FAILED",
      title: "리뷰 인증 제출을 완료하지 못했습니다.",
      situation: "리뷰어가 작성 완료 화면에서 인증 이미지를 제출하던 중이었습니다.",
      cause: "이미지 업로드, OCR 분석 또는 제출 결과 저장 과정에서 예상하지 못한 오류가 발생했습니다.",
      impact: "리뷰 인증이 접수되지 않았으며 포인트도 지급되지 않았습니다.",
      action: "이미지 저장소와 OCR 서비스, 데이터베이스 상태를 확인한 뒤 다시 제출해 주세요.",
      route: req.url,
      method: "POST",
      entityType: "reviewer",
      entityId: reviewerId,
      error: e,
    });
    return err("COMPLETE_FAILED", "완료 신고를 처리하지 못했어요.", 500);
  }
}
