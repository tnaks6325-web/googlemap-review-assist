import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  completeReviewerCampaignAssignment,
  rejectReviewerCampaignProof,
  ReviewerCampaignError,
} from "@/lib/domain/reviewer-campaigns";
import { err, ok } from "@/lib/http";
import { recordOperationalError } from "@/lib/error-logging";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { resolveReviewRejectionReason } from "@/lib/review-rejection";
import {
  getPrivateReviewProof,
  privateReviewProofResponse,
  ReviewProofStorageError,
} from "@/lib/review-proof-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR = 60 * 60 * 1000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요해요.", 401);

  const { assignmentId } = await params;
  const receipt = await prisma.receipt.findUnique({
    where: { id: assignmentId.trim() },
    select: { source: true, reviewProofImageUrl: true },
  });
  if (!receipt || receipt.source !== "CAMPAIGN_ASSIGNMENT" || !receipt.reviewProofImageUrl) {
    return err("PROOF_NOT_FOUND", "제출한 캡처를 찾을 수 없어요.", 404);
  }

  try {
    const result = await getPrivateReviewProof(receipt.reviewProofImageUrl, req.headers.get("if-none-match"));
    return privateReviewProofResponse(result);
  } catch (e) {
    if (e instanceof ReviewProofStorageError) return err(e.code, e.message, e.status);
    await recordOperationalError({
      severity: "ERROR",
      source: "INTEGRATION",
      workflow: "리뷰 인증 확인",
      stage: "인증 이미지 불러오기",
      code: "PROOF_STORAGE_UNAVAILABLE",
      title: "리뷰 인증 이미지를 불러오지 못했습니다.",
      situation: "관리자가 제출된 리뷰 인증 이미지를 확인하던 중이었습니다.",
      cause: "비공개 이미지 저장소에 연결하거나 파일을 읽는 과정에서 오류가 발생했습니다.",
      impact: "해당 인증 이미지를 표시할 수 없어 승인 여부를 판단할 수 없습니다.",
      action: "이미지 저장소 상태를 확인한 뒤 다시 열어 주세요.",
      route: req.url,
      method: "GET",
      entityType: "assignment",
      entityId: assignmentId,
      error: e,
    });
    return err("PROOF_STORAGE_UNAVAILABLE", "캡처 저장소에 연결할 수 없어요.", 503);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요해요", 401);

  if (!(await rateLimit(`admin:review-proof:${adminId}:${clientIp(req)}`, 120, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요.", 429);
  }

  const { assignmentId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "approve" && action !== "reject") {
    return err("INVALID_ACTION", "승인 또는 반려 작업을 선택해 주세요");
  }
  const rejectionReason =
    action === "reject"
      ? resolveReviewRejectionReason(body?.reasonCode, body?.customReason)
      : null;
  if (rejectionReason && !rejectionReason.ok) {
    return err("INVALID_REJECTION_REASON", rejectionReason.message, 400);
  }
  const note =
    action === "reject"
      ? rejectionReason?.note
      : typeof body?.note === "string"
        ? body.note.trim()
        : undefined;
  if (note && note.length > 500) {
    return err("INVALID_NOTE", "검수 메모는 500자 이내로 입력해 주세요.", 400);
  }

  try {
    const result =
      action === "approve"
        ? await completeReviewerCampaignAssignment(assignmentId, adminId, note)
        : await rejectReviewerCampaignProof(assignmentId, adminId, note);
    return ok(result);
  } catch (e) {
    if (e instanceof ReviewerCampaignError) {
      return err(e.code, e.message, e.status);
    }
    await recordOperationalError({
      severity: "ERROR",
      source: "SERVER",
      workflow: "리뷰 인증 처리",
      stage: action === "approve" ? "인증 승인과 포인트 지급" : "인증 반려",
      code: "REVIEW_PROOF_FAILED",
      title: "리뷰 인증 처리 결과를 저장하지 못했습니다.",
      situation: "관리자가 제출된 리뷰 인증을 승인 또는 반려하던 중이었습니다.",
      cause: "인증 상태와 포인트 원장을 함께 저장하는 과정에서 예상하지 못한 오류가 발생했습니다.",
      impact: "승인 또는 반려 처리가 완료되지 않았습니다.",
      action: "현재 인증 상태와 포인트 원장을 확인한 뒤 다시 처리해 주세요.",
      route: req.url,
      method: "POST",
      entityType: "assignment",
      entityId: assignmentId,
      error: e,
    });
    return err("REVIEW_PROOF_FAILED", "검수 요청을 처리하지 못했어요", 500);
  }
}
