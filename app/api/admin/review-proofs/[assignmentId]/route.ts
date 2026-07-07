import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import {
  completeReviewerCampaignAssignment,
  rejectReviewerCampaignProof,
  ReviewerCampaignError,
} from "@/lib/domain/reviewer-campaigns";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요해요", 401);

  const { assignmentId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const note = typeof body?.note === "string" ? body.note : undefined;
  if (action !== "approve" && action !== "reject") {
    return err("INVALID_ACTION", "승인 또는 반려 작업을 선택해 주세요");
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
    return err("REVIEW_PROOF_FAILED", "검수 요청을 처리하지 못했어요", 500);
  }
}
