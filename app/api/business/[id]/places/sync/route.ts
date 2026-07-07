import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getOwnedBusiness } from "@/lib/auth/owner-guard";
import { checkOrigin } from "@/lib/auth/origin";
import { resolveGooglePlace } from "@/lib/domain/external-place-providers";
import { saveExternalPlace } from "@/lib/domain/external-place-save";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const { id } = await params;
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);
  if (!business) return err("FORBIDDEN", "권한이 없어요", 403);

  const body = await req.json().catch(() => null);
  const requestedPlatform = body?.platform ? String(body.platform).trim().toUpperCase() : null;
  const places = await prisma.externalPlace.findMany({
    where: { businessId: id, ...(requestedPlatform ? { platform: requestedPlatform } : {}) },
  });

  const results: { platform: string; status: "SUCCESS" | "FAILED"; message?: string }[] = [];
  for (const place of places) {
    try {
      if (place.platform === "GOOGLE" && place.externalId) {
        const resolved = await resolveGooglePlace(place.externalId);
        await saveExternalPlace(id, resolved.place);
      } else {
        await prisma.externalPlace.update({ where: { id: place.id }, data: { syncedAt: new Date() } });
      }
      await prisma.externalSyncLog.create({ data: { businessId: id, platform: place.platform, status: "SUCCESS" } });
      results.push({ platform: place.platform, status: "SUCCESS" });
    } catch {
      await prisma.externalSyncLog.create({
        data: { businessId: id, platform: place.platform, status: "FAILED", message: "sync failed" },
      });
      results.push({ platform: place.platform, status: "FAILED", message: "동기화에 실패했어요" });
    }
  }

  return ok({ results });
}
