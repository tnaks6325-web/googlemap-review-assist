import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getOwnedBusiness } from "@/lib/auth/owner-guard";
import { checkOrigin } from "@/lib/auth/origin";
import { rateLimit } from "@/lib/rate-limit";
import { generateCodes } from "@/lib/domain/codes";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;
const MAX_CODES_PER_CAMPAIGN = 1000;

async function guard(id: string, campaignId: string) {
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return { error: err("UNAUTHORIZED", "로그인이 필요해요", 401) };
  if (!business) return { error: err("FORBIDDEN", "권한이 없어요", 403) };
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.businessId !== id) {
    return { error: err("NOT_FOUND", "캠페인을 찾을 수 없어요", 404) };
  }
  return { ownerId, campaign };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; campaignId: string }> }
) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const { id, campaignId } = await params;
  const g = await guard(id, campaignId);
  if (g.error) return g.error;

  // R2: 발급 레이트리밋 + 캠페인당 누적 코드 상한
  if (!rateLimit(`owner:codes:${g.ownerId}`, 20, HOUR).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const body = await req.json().catch(() => null);
  const count = Number(body?.count ?? 10);
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    return err("INVALID_INPUT", "발급 수량은 1~200개여야 해요");
  }

  const existing = await prisma.campaignCode.count({ where: { campaignId } });
  if (existing + count > MAX_CODES_PER_CAMPAIGN) {
    return err("CODE_LIMIT", `캠페인당 코드는 최대 ${MAX_CODES_PER_CAMPAIGN}개예요`, 429);
  }

  const codes = await generateCodes(campaignId, count);
  return ok({ codes, issued: codes.length });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; campaignId: string }> }
) {
  const { id, campaignId } = await params;
  const g = await guard(id, campaignId);
  if (g.error) return g.error;

  const codes = await prisma.campaignCode.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { code: true, used: true, createdAt: true },
  });
  return ok({ codes });
}
