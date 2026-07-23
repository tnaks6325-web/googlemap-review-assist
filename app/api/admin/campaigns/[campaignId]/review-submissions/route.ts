import { getAdminId } from "@/lib/auth/session";
import {
  AdminCampaignReviewSubmissionError,
  listAdminCampaignReviewSubmissions,
} from "@/lib/domain/admin-campaign-review-submissions";
import { recordOperationalError } from "@/lib/error-logging";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInteger(value: string | null, fallback: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);

  const url = new URL(req.url);
  const page = positiveInteger(url.searchParams.get("page"), 1);
  const pageSize = positiveInteger(url.searchParams.get("pageSize"), 24);
  if (page === null || pageSize === null || pageSize > 50) {
    return err(
      "INVALID_PAGINATION",
      "페이지는 1 이상, 페이지 크기는 1~50으로 입력해 주세요.",
      400,
    );
  }

  const { campaignId } = await params;
  try {
    return ok(
      await listAdminCampaignReviewSubmissions(campaignId, { page, pageSize }),
    );
  } catch (cause) {
    if (cause instanceof AdminCampaignReviewSubmissionError) {
      return err(cause.code, cause.message, cause.status);
    }
    await recordOperationalError({
      severity: "ERROR",
      source: "SERVER",
      workflow: "캠페인 리뷰 제출함",
      stage: "제출 이미지 목록 조회",
      code: "CAMPAIGN_REVIEW_SUBMISSIONS_FAILED",
      title: "캠페인 리뷰 제출 목록을 불러오지 못했습니다.",
      situation: "관리자가 캠페인별 리뷰 제출함을 열던 중이었습니다.",
      cause: "리뷰 제출 데이터와 검수 상태를 조회하는 중 오류가 발생했습니다.",
      impact: "해당 캠페인의 제출 이미지를 표시할 수 없습니다.",
      action: "잠시 후 다시 열고, 계속 실패하면 오류 로그를 확인해 주세요.",
      route: req.url,
      method: "GET",
      entityType: "campaign",
      entityId: campaignId,
      error: cause,
    });
    return err(
      "CAMPAIGN_REVIEW_SUBMISSIONS_FAILED",
      "리뷰 제출함을 불러오지 못했습니다.",
      500,
    );
  }
}
