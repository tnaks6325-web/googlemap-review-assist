import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { campaignOperationsMutationLockResponse } from "@/lib/admin-campaign-operations-lock";
import {
  collectCampaignNaverVisitorReviewPreviews,
  NaverVisitorReviewCollectorError,
} from "@/lib/domain/naver-visitor-review-collector";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOUR = 60 * 60 * 1000;

function parseKeywords(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처를 확인할 수 없습니다.", 403);
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  const lockResponse = await campaignOperationsMutationLockResponse();
  if (lockResponse) return lockResponse;
  const ip = clientIp(req);
  if (!(await rateLimit(`admin:naver-visitor-review:${adminId}:${ip}`, 12, HOUR)).ok) {
    return err("RATE_LIMITED", "방문자리뷰 수집 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  }

  const body = await req.json().catch(() => null) as { naverPlaceInput?: unknown } | null;
  if (!body || typeof body.naverPlaceInput !== "string") {
    return err("NAVER_PLACE_INPUT_INVALID", "네이버 플레이스 URL 또는 숫자 ID를 입력해 주세요.", 400);
  }

  const { campaignId } = await params;
  try {
    const run = await collectCampaignNaverVisitorReviewPreviews(campaignId, body.naverPlaceInput);
    return ok({
      run: {
        id: run.id,
        status: run.status,
        placeId: run.placeId,
        placeName: run.placeName,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
        collectedAt: run.finishedAt?.toISOString() ?? null,
        previews: run.previews.map((preview) => ({
          ordinal: preview.ordinal,
          authorMasked: preview.authorMasked,
          content: preview.content,
          rating: preview.rating,
          visitDate: preview.visitDate,
          verificationMethod: preview.verificationMethod,
          keywords: parseKeywords(preview.keywordsJson),
          hasMedia: preview.hasMedia,
        })),
      },
    });
  } catch (error) {
    if (error instanceof NaverVisitorReviewCollectorError) return err(error.code, error.message, error.status);
    return err("NAVER_VISITOR_REVIEW_COLLECTION_FAILED", "방문자리뷰를 수집하지 못했습니다.", 500);
  }
}
