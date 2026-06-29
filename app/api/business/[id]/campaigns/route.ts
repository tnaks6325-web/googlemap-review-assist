import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getOwnedBusiness } from "@/lib/auth/owner-guard";
import { checkOrigin } from "@/lib/auth/origin";
import { rateLimit } from "@/lib/rate-limit";
import { generateUniqueSlug } from "@/lib/domain/codes";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;
const MAX_CAMPAIGNS = 20;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const { id } = await params;
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);
  if (!business) return err("FORBIDDEN", "권한이 없어요", 403);

  // R3: 레이트리밋 + 매장당 캠페인 수 상한
  if (!rateLimit(`owner:campaign:${ownerId}`, 20, HOUR).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }
  const count = await prisma.campaign.count({ where: { businessId: id } });
  if (count >= MAX_CAMPAIGNS) return err("CAMPAIGN_LIMIT", "캠페인 수 한도를 초과했어요", 429);

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim().slice(0, 60) || "기본 캠페인";

  // R4: 슬러그 충돌(경쟁) 시 P2002 → 재시도(500 방지)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const slug = await generateUniqueSlug();
      const campaign = await prisma.campaign.create({
        data: { businessId: id, slug, name, active: true },
      });
      return ok({ campaignId: campaign.id, slug: campaign.slug, name: campaign.name });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 4) {
        continue;
      }
      throw e;
    }
  }
  return err("SLUG_CONFLICT", "잠시 후 다시 시도해 주세요", 503);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);
  if (!business) return err("FORBIDDEN", "권한이 없어요", 403);

  const campaigns = await prisma.campaign.findMany({
    where: { businessId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, name: true, active: true, _count: { select: { codes: true } } },
  });
  return ok({ campaigns });
}
