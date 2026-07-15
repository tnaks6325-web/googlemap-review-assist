import { checkOrigin } from "@/lib/auth/origin";
import { getReviewerId } from "@/lib/auth/session";
import {
  getReviewerCampaignProofContext,
  ReviewerCampaignError,
  submitReviewerCampaignProof,
} from "@/lib/domain/reviewer-campaigns";
import { analyzeReviewProof, type ReviewProofAnalysis } from "@/lib/domain/review-proof-analysis";
import { err, ok } from "@/lib/http";
import {
  ReviewProofStorageError,
  uploadReviewProof,
  validateReviewProofImage,
} from "@/lib/review-proof-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);

  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요.", 401);

  try {
    const form = await req.formData();
    const assignmentId = String(form.get("assignmentId") ?? "");
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
    const screenshotUrl = await uploadReviewProof({
      assignmentId,
      bytes: imageBytes,
      mimeType: image.mimeType,
    });

    let analysis: ReviewProofAnalysis;
    try {
      analysis = await analyzeReviewProof({
        draftText: expectedDraftText,
        imageBytes,
        mimeType: image.mimeType,
        expectedPlaceName: proofContext.businessName,
        mockText: typeof form.get("mockOcrText") === "string" ? String(form.get("mockOcrText")) : undefined,
      });
    } catch {
      analysis = {
        status: "UNAVAILABLE",
        provider: "ocr",
        extractedText: "",
        similarity: 0,
        reason: "OCR_FAILED",
        confidence: 0,
      };
    }

    const result = await submitReviewerCampaignProof(reviewerId, assignmentId, {
      screenshotUrl,
      screenshotMimeType: image.mimeType,
      screenshotOriginalName: screenshot.name || "review-proof",
      draftText: expectedDraftText,
      analysis,
    });
    return ok(result);
  } catch (e) {
    if (e instanceof ReviewProofStorageError) return err(e.code, e.message, e.status);
    if (e instanceof ReviewerCampaignError) return err(e.code, e.message, e.status);
    return err("COMPLETE_FAILED", "완료 신고를 처리하지 못했어요.", 500);
  }
}
