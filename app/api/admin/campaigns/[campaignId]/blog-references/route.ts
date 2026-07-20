import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import {
  collectCampaignBlogReferences,
  countCampaignBlogReferences,
  listCampaignBlogReferences,
} from "@/lib/domain/campaign-blog-references";
import { recordOperationalError } from "@/lib/error-logging";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

export async function GET(_req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다", 401);

  const { campaignId } = await params;
  return ok({
    references: await listCampaignBlogReferences(campaignId),
    totalCount: await countCampaignBlogReferences(campaignId),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다", 403);

  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다", 401);

  const ip = clientIp(req);
  if (!(await rateLimit(`admin:blog-references:${adminId}:${ip}`, 30, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const { campaignId } = await params;

  try {
    const result = await collectCampaignBlogReferences(campaignId);
    if (!result) return err("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없습니다", 404);
    return ok(result);
  } catch (error) {
    await recordOperationalError({
      severity: "ERROR",
      source: "INTEGRATION",
      workflow: "블로그 참고자료 수집",
      stage: "네이버 블로그 검색과 저장",
      code: "NAVER_BLOG_SEARCH_FAILED",
      title: "블로그 참고자료를 수집하지 못했습니다.",
      situation: "관리자가 캠페인의 참고자료 자동 수집을 실행하던 중이었습니다.",
      cause: "네이버 블로그 검색 결과를 불러오거나 검색 결과를 저장하는 과정이 실패했습니다.",
      impact: "해당 캠페인에 새 참고자료가 추가되지 않았습니다.",
      action: "네이버 검색 서비스 상태와 캠페인 장소 정보를 확인한 뒤 다시 실행해 주세요.",
      route: req.url,
      method: "POST",
      entityType: "campaign",
      entityId: campaignId,
      error,
    });
    return err("NAVER_BLOG_SEARCH_FAILED", "네이버 블로그 참고자료를 수집하지 못했습니다", 502);
  }
}
