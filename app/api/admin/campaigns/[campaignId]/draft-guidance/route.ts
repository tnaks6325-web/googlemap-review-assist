import { prisma } from "@/lib/db";
import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { campaignOperationsMutationLockResponse } from "@/lib/admin-campaign-operations-lock";
import {
  isCampaignReviewDraftIndustry,
  normalizeCampaignDraftGuidance,
} from "@/lib/domain/campaign-review-draft";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

function normalizeLines(value: unknown, maxItems: number, maxLength: number) {
  const values = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of values) {
    if (typeof item !== "string") continue;
    const clean = item.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
    if (result.length >= maxItems) break;
  }
  return result;
}

export async function PUT(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다", 403);

  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다", 401);

  const lockResponse = await campaignOperationsMutationLockResponse();
  if (lockResponse) return lockResponse;

  const ip = clientIp(req);
  if (!(await rateLimit(`admin:draft-guidance:${adminId}:${ip}`, 60, HOUR)).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return err("INVALID_INPUT", "입력값을 확인해 주세요", 400);

  const industryValue = body.industry;
  const industry = industryValue == null || industryValue === "" ? null : industryValue;
  if (industry !== null && !isCampaignReviewDraftIndustry(industry)) {
    return err("INVALID_INDUSTRY", "업종 값을 확인해 주세요", 400);
  }

  const approvedFacts = normalizeLines(body.approvedFacts, 8, 160);
  const bannedTerms = normalizeLines(body.bannedTerms, 12, 40);
  const { campaignId } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!campaign) return err("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없습니다", 404);

  const guidance = await prisma.campaignDraftGuidance.upsert({
    where: { campaignId },
    create: {
      campaignId,
      industry,
      approvedFactsJson: JSON.stringify(approvedFacts),
      bannedTermsJson: JSON.stringify(bannedTerms),
    },
    update: {
      industry,
      approvedFactsJson: JSON.stringify(approvedFacts),
      bannedTermsJson: JSON.stringify(bannedTerms),
    },
  });

  return ok({ guidance: normalizeCampaignDraftGuidance(guidance) });
}
