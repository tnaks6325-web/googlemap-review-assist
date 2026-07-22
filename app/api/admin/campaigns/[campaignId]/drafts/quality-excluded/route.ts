import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import {
  CampaignReviewDraftError,
  deleteCampaignQualityExcludedDrafts,
} from "@/lib/domain/campaign-review-draft";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR = 60 * 60 * 1000;

type QualityExcludedRouteContext = {
  params: Promise<{ campaignId: string }>;
};

export async function DELETE(req: Request, { params }: QualityExcludedRouteContext) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요해요", 401);
  const allowed = await rateLimit(
    `admin:prepared-draft:delete-quality-excluded:${adminId}:${clientIp(req)}`,
    20,
    HOUR,
  );
  if (!allowed.ok) return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);

  const { campaignId } = await params;
  try {
    return ok(await deleteCampaignQualityExcludedDrafts(campaignId));
  } catch (error) {
    if (error instanceof CampaignReviewDraftError) {
      return err(error.code, error.message, error.status);
    }
    return err("DRAFT_BULK_DELETE_FAILED", "품질 제외 원고를 모두 삭제하지 못했어요", 500);
  }
}
