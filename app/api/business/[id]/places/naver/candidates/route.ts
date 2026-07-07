import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getOwnedBusiness } from "@/lib/auth/owner-guard";
import { checkOrigin } from "@/lib/auth/origin";
import { rateLimit } from "@/lib/rate-limit";
import { findNaverCandidates } from "@/lib/domain/external-place-providers";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const { id } = await params;
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);
  if (!business) return err("FORBIDDEN", "권한이 없어요", 403);
  if (!rateLimit(`owner:naver-candidates:${ownerId}`, 40, HOUR).ok) {
    return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
  }

  const body = await req.json().catch(() => null);
  const query = body?.query ? String(body.query).trim().slice(0, 120) : undefined;
  const google = await prisma.externalPlace.findUnique({
    where: { businessId_platform: { businessId: id, platform: "GOOGLE" } },
  });
  const base = {
    name: google?.name ?? business.name,
    address: google?.address ?? business.address,
    lat: google?.lat,
    lng: google?.lng,
  };

  try {
    const result = await findNaverCandidates(base, query);
    return ok({ ...result, base });
  } catch {
    return err("NAVER_LOCAL_SEARCH_FAILED", "네이버 플레이스 후보를 확인하지 못했어요", 502);
  }
}
