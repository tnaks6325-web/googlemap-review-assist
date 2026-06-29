import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { slug },
    include: { business: { include: { menus: true } } },
  });
  if (!campaign) return err("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없어요", 404);

  return ok({
    campaignId: campaign.id,
    active: campaign.active,
    business: { id: campaign.business.id, name: campaign.business.name },
    menus: campaign.business.menus.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
    })),
  });
}
