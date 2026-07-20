import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import {
  CampaignReviewDraftError,
  generateCampaignReviewDraftPreview,
} from "@/lib/domain/campaign-review-draft";
import { recordOperationalError } from "@/lib/error-logging";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR = 60 * 60 * 1000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요해요", 401);

  const ip = clientIp(req);
  if (!(await rateLimit(`admin:draft-preview:${adminId}:${ip}`, 20, HOUR)).ok) {
    return err("RATE_LIMITED", "원고 생성 테스트 횟수를 초과했어요. 잠시 후 다시 시도해 주세요", 429);
  }

  const { campaignId } = await params;
  try {
    return ok(await generateCampaignReviewDraftPreview(campaignId));
  } catch (error) {
    if (error instanceof CampaignReviewDraftError) {
      return err(error.code, error.message, error.status);
    }
    await recordOperationalError({
      severity: "ERROR",
      source: "INTEGRATION",
      workflow: "리뷰 원고 테스트",
      stage: "관리자 미리보기 생성",
      code: "DRAFT_PREVIEW_FAILED",
      title: "테스트 원고를 생성하지 못했습니다.",
      situation: "관리자가 캠페인의 원고 생성 결과를 미리 확인하던 중이었습니다.",
      cause: "캠페인 자료 분석 또는 외부 원고 생성 서비스 호출 과정에서 오류가 발생했습니다.",
      impact: "테스트 원고가 표시되지 않았으며 캠페인 데이터는 변경되지 않았습니다.",
      action: "원고 기준 자료와 외부 서비스 상태를 확인한 뒤 다시 실행해 주세요.",
      route: req.url,
      method: "POST",
      entityType: "campaign",
      entityId: campaignId,
      error,
    });
    return err("DRAFT_PREVIEW_FAILED", "테스트 원고를 생성하지 못했어요", 500);
  }
}
