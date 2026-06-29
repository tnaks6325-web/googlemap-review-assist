import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getOwnerId } from "@/lib/auth/session";
import { checkOrigin } from "@/lib/auth/origin";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;
const MAX_BUSINESSES = 50;
const PLACE_RE = /^[A-Za-z0-9_-]{1,128}$/;

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const ownerId = await getOwnerId();
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  // R3: 생성 레이트리밋 + 소유자당 매장 수 상한
  if (!rateLimit(`owner:biz:${ownerId}`, 10, HOUR).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const address = body?.address ? String(body.address).trim().slice(0, 200) : null;
  const googlePlaceId = body?.googlePlaceId ? String(body.googlePlaceId).trim().slice(0, 200) : null;
  if (name.length < 1 || name.length > 60) return err("INVALID_INPUT", "상호를 입력해 주세요");
  // R6: Place ID 형식 검증(스푸핑/오용 방지)
  if (googlePlaceId && !PLACE_RE.test(googlePlaceId)) {
    return err("INVALID_PLACE_ID", "구글 Place ID 형식이 올바르지 않아요");
  }

  const count = await prisma.business.count({ where: { ownerId } });
  if (count >= MAX_BUSINESSES) return err("BUSINESS_LIMIT", "매장 등록 한도를 초과했어요", 429);

  const business = await prisma.business.create({
    data: { ownerId, name, address, googlePlaceId },
  });
  return ok({ businessId: business.id });
}

export async function GET() {
  const ownerId = await getOwnerId();
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const businesses = await prisma.business.findMany({
    where: { ownerId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, _count: { select: { menus: true, campaigns: true } } },
  });
  return ok({ businesses });
}
