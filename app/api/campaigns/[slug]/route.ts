import { getPublicCampaignDetail } from "@/lib/domain/operator-campaigns";
import { ok, err } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const campaign = await getPublicCampaignDetail(slug);
  if (!campaign) return err("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없어요", 404);

  return ok({
    campaignId: campaign.id,
    active: campaign.active,
    business: {
      id: campaign.businessId,
      name: campaign.businessName,
      address: campaign.address,
      category: campaign.category,
      googleMapsUrl: campaign.googleMapsUrl,
      rating: campaign.rating,
      reviewCount: campaign.reviewCount,
    },
    menus: campaign.menus.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
    })),
  });
}
