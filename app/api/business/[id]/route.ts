import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getOwnedBusiness } from "@/lib/auth/owner-guard";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);
  if (!business) return err("FORBIDDEN", "권한이 없어요", 403);

  const [menus, campaigns] = await Promise.all([
    prisma.menu.findMany({ where: { businessId: id }, orderBy: { id: "asc" } }),
    prisma.campaign.findMany({
      where: { businessId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        active: true,
        _count: { select: { codes: true } },
      },
    }),
  ]);

  return ok({
    business: { id: business.id, name: business.name, address: business.address },
    menus,
    campaigns,
  });
}
