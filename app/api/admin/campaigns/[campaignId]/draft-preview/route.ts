import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import {
  CampaignReviewDraftError,
  generateCampaignReviewDraftPreview,
} from "@/lib/domain/campaign-review-draft";
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
    return err("DRAFT_PREVIEW_FAILED", "테스트 원고를 생성하지 못했어요", 500);
  }
}
