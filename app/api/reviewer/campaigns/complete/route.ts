import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { checkOrigin } from "@/lib/auth/origin";
import { getReviewerId } from "@/lib/auth/session";
import {
  getReviewerCampaignProofContext,
  ReviewerCampaignError,
  submitReviewerCampaignProof,
} from "@/lib/domain/reviewer-campaigns";
import { analyzeReviewProof, type ReviewProofAnalysis } from "@/lib/domain/review-proof-analysis";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function sniffImage(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  return false;
}

async function saveScreenshot(file: File, assignmentId: string, bytes: Uint8Array) {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new ReviewerCampaignError("INVALID_FILE_TYPE", "JPG, PNG, WEBP 캡처 이미지만 업로드할 수 있어요");
  }
  if (file.size <= 0 || file.size > MAX_SCREENSHOT_BYTES) {
    throw new ReviewerCampaignError("FILE_TOO_LARGE", "캡처 이미지는 8MB 이하로 업로드해 주세요");
  }
  if (!sniffImage(bytes)) {
    throw new ReviewerCampaignError("INVALID_IMAGE", "이미지 파일만 업로드할 수 있어요");
  }

  const safeAssignmentId = assignmentId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "assignment";
  const filename = `${safeAssignmentId}-${randomUUID()}.${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "review-proofs");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), Buffer.from(bytes));
  return `/uploads/review-proofs/${filename}`;
}

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  try {
    const form = await req.formData();
    const assignmentId = String(form.get("assignmentId") ?? "");
    const draftText = String(form.get("draftText") ?? "");
    const screenshot = form.get("screenshot");
    if (!(screenshot instanceof File)) {
      return err("MISSING_SCREENSHOT", "구글맵 리뷰 캡처본을 첨부해 주세요", 400);
    }

    const proofContext = await getReviewerCampaignProofContext(reviewerId, assignmentId);
    const imageBytes = new Uint8Array(await screenshot.arrayBuffer());
    const screenshotUrl = await saveScreenshot(screenshot, assignmentId, imageBytes);
    let analysis: ReviewProofAnalysis;
    try {
      analysis = await analyzeReviewProof({
        draftText,
        imageBytes,
        mimeType: screenshot.type,
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
      screenshotMimeType: screenshot.type,
      screenshotOriginalName: screenshot.name || "review-proof",
      draftText,
      analysis,
    });
    return ok(result);
  } catch (e) {
    if (e instanceof ReviewerCampaignError) {
      return err(e.code, e.message, e.status);
    }
    return err("COMPLETE_FAILED", "완료 신고를 처리하지 못했어요", 500);
  }
}
