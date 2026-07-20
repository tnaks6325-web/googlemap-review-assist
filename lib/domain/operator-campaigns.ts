import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";
import {
  toAdminCampaignBlogReference,
  type AdminCampaignBlogReference,
} from "@/lib/domain/campaign-blog-references";
import {
  normalizeCampaignDraftGuidance,
  summarizeCampaignReviewDraftSources,
  type CampaignDraftGuidance,
} from "@/lib/domain/campaign-review-draft";

export interface PublicCampaignCard {
  id: string;
  slug: string;
  campaignName: string;
  businessName: string;
  address: string | null;
  category: string | null;
  googleMapsUrl: string;
  rating: number | null;
  reviewCount: number | null;
  completedCount: number;
  rewardPoints: number;
  availabilityLabel: string;
  statusLabel: string;
  createdAt: Date;
}

export interface PublicCampaignDetail extends PublicCampaignCard {
  active: boolean;
  businessId: string;
  menus: Array<{ id: string; name: string; category: string | null }>;
}

export interface AdminConnectedNaverPlace {
  name: string;
  url: string | null;
  address: string | null;
  category: string | null;
  matchStatus: string;
  matchConfidence: number | null;
  syncedAt: string | null;
}

export interface AdminCampaignRow extends PublicCampaignCard {
  active: boolean;
  assignedCount: number;
  paidPointAmount: number;
  menuCount: number;
  issuedCodeCount: number;
  blogReferenceCount: number;
  reviewReferenceCount: number;
  draftSourceGroupCount: number;
  canGenerateReviewDraft: boolean;
  draftGuidance: CampaignDraftGuidance;
  draftSourceGroups: {
    googlePlace: boolean;
    googleReviews: boolean;
    naverPlace: boolean;
    naverReferences: boolean;
  };
  blogReferences: AdminCampaignBlogReference[];
  hasGooglePlace: boolean;
  naverPlace: AdminConnectedNaverPlace | null;
}

export const DEFAULT_REWARD_POINTS = 5000;
const CAMPAIGN_ASSIGNMENT_SOURCE = "CAMPAIGN_ASSIGNMENT";
const CAMPAIGN_ASSIGNMENT_STATUS_COMPLETED = "COMPLETED";
const CAMPAIGN_COMPLETION_IDEMPOTENCY_PREFIX = "campaign-complete:";
const PUBLIC_CAMPAIGN_CACHE_SECONDS = 10;

export function googleMapsSearchUrl(name: string, address: string | null, googlePlaceId: string | null) {
  if (googlePlaceId) {
    return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(googlePlaceId)}`;
  }
  const query = [name, address].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || name)}`;
}

function availabilityLabel(completedCount: number) {
  if (completedCount === 0) return "오늘 참여 가능";
  if (completedCount < 5) return "참여 가능";
  return "운영자 확인 후 참여";
}

function statusLabel(active: boolean) {
  return active ? "진행 중" : "중지됨";
}

type CampaignWithBusiness = Awaited<ReturnType<typeof fetchCampaigns>>[number];
type CampaignForPresentation = Pick<
  CampaignWithBusiness,
  "id" | "slug" | "name" | "active" | "businessId" | "createdAt"
> & {
  business: Pick<CampaignWithBusiness["business"], "name" | "address" | "googlePlaceId" | "externalPlaces">;
};
type CampaignParticipationStats = {
  assignedCount: number;
  completedCount: number;
  paidPointAmount: number;
};

async function fetchCampaigns(includeInactive = false) {
  return prisma.campaign.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: { createdAt: "desc" },
    include: {
      business: {
        select: {
          name: true,
          address: true,
          googlePlaceId: true,
          externalPlaces: {
            where: { platform: { in: ["GOOGLE", "NAVER"] } },
            select: {
              platform: true,
              externalId: true,
              url: true,
              name: true,
              address: true,
              category: true,
              rating: true,
              reviewCount: true,
              matchStatus: true,
              matchConfidence: true,
              syncedAt: true,
            },
          },
          externalReviews: {
            where: { content: { not: null } },
            select: { id: true, platform: true },
            take: 50,
          },
          _count: { select: { menus: true } },
        },
      },
      blogReferences: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          description: true,
          link: true,
          bloggerName: true,
          bloggerLink: true,
          postdate: true,
          publishedAt: true,
          searchQuery: true,
          status: true,
          createdAt: true,
        },
      },
      draftGuidance: true,
      _count: { select: { codes: true, blogReferences: true } },
    },
  });
}

function emptyCampaignParticipationStats(): CampaignParticipationStats {
  return { assignedCount: 0, completedCount: 0, paidPointAmount: 0 };
}

async function fetchCampaignParticipationStats(campaignIds: string[]) {
  const statsByCampaignId = new Map<string, CampaignParticipationStats>(
    campaignIds.map((campaignId) => [campaignId, emptyCampaignParticipationStats()]),
  );
  if (campaignIds.length === 0) return statsByCampaignId;

  const groups = await prisma.receipt.groupBy({
    by: ["campaignId", "status"],
    where: {
      campaignId: { in: campaignIds },
      source: CAMPAIGN_ASSIGNMENT_SOURCE,
    },
    _count: { _all: true },
  });
  for (const group of groups) {
    const stats = statsByCampaignId.get(group.campaignId) ?? emptyCampaignParticipationStats();
    stats.assignedCount += group._count._all;
    if (group.status === CAMPAIGN_ASSIGNMENT_STATUS_COMPLETED) {
      stats.completedCount += group._count._all;
    }
    statsByCampaignId.set(group.campaignId, stats);
  }
  return statsByCampaignId;
}

function completionIdempotencyKey(receiptId: string) {
  return `${CAMPAIGN_COMPLETION_IDEMPOTENCY_PREFIX}${receiptId}`;
}

function toPublicCampaign(
  campaign: CampaignForPresentation,
  stats = emptyCampaignParticipationStats(),
): PublicCampaignCard {
  const googlePlace = campaign.business.externalPlaces.find((place) => place.platform === "GOOGLE") ?? null;
  const businessName = googlePlace?.name ?? campaign.business.name;
  const address = googlePlace?.address ?? campaign.business.address;
  return {
    id: campaign.id,
    slug: campaign.slug,
    campaignName: campaign.name,
    businessName,
    address,
    category: googlePlace?.category ?? null,
    googleMapsUrl:
      googlePlace?.url ?? googleMapsSearchUrl(businessName, address, campaign.business.googlePlaceId),
    rating: googlePlace?.rating ?? null,
    reviewCount: googlePlace?.reviewCount ?? null,
    completedCount: stats.completedCount,
    rewardPoints: DEFAULT_REWARD_POINTS,
    availabilityLabel: availabilityLabel(stats.completedCount),
    statusLabel: statusLabel(campaign.active),
    createdAt: campaign.createdAt,
  };
}

function toAdminNaverPlace(campaign: CampaignWithBusiness): AdminConnectedNaverPlace | null {
  const naverPlace = campaign.business.externalPlaces.find((place) => place.platform === "NAVER") ?? null;
  if (!naverPlace) return null;
  return {
    name: naverPlace.name,
    url: naverPlace.url,
    address: naverPlace.address,
    category: naverPlace.category,
    matchStatus: naverPlace.matchStatus,
    matchConfidence: naverPlace.matchConfidence,
    syncedAt: naverPlace.syncedAt?.toISOString() ?? null,
  };
}

async function getPublicCampaignDetailUncached(slug: string): Promise<PublicCampaignDetail | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { slug },
    include: {
      business: {
        select: {
          name: true,
          address: true,
          googlePlaceId: true,
          menus: { select: { id: true, name: true, category: true } },
          externalPlaces: {
            where: { platform: "GOOGLE" },
            take: 1,
            select: {
              platform: true,
              externalId: true,
              url: true,
              name: true,
              address: true,
              category: true,
              rating: true,
              reviewCount: true,
              matchStatus: true,
              matchConfidence: true,
              syncedAt: true,
            },
          },
        },
      },
    },
  });
  if (!campaign) return null;
  const stats = (await fetchCampaignParticipationStats([campaign.id])).get(campaign.id);

  return {
    ...toPublicCampaign(campaign, stats),
    active: campaign.active,
    businessId: campaign.businessId,
    menus: campaign.business.menus.map((menu) => ({
      id: menu.id,
      name: menu.name,
      category: menu.category,
    })),
  };
}

const getCachedPublicCampaignDetail = unstable_cache(
  async (slug: string) => getPublicCampaignDetailUncached(slug),
  ["public-campaign-detail"],
  { revalidate: PUBLIC_CAMPAIGN_CACHE_SECONDS, tags: ["public-campaigns"] },
);

export async function getPublicCampaignDetail(slug: string): Promise<PublicCampaignDetail | null> {
  if (process.env.NODE_ENV !== "production") return getPublicCampaignDetailUncached(slug);
  return getCachedPublicCampaignDetail(slug);
}

async function listPublicCampaignsUncached(): Promise<PublicCampaignCard[]> {
  const campaigns = await fetchCampaigns(false);
  const statsByCampaignId = await fetchCampaignParticipationStats(campaigns.map((campaign) => campaign.id));
  return campaigns.map((campaign) => toPublicCampaign(campaign, statsByCampaignId.get(campaign.id)));
}

const getCachedPublicCampaigns = unstable_cache(
  async () => listPublicCampaignsUncached(),
  ["public-campaign-list"],
  { revalidate: PUBLIC_CAMPAIGN_CACHE_SECONDS, tags: ["public-campaigns"] },
);

export async function listPublicCampaigns(): Promise<PublicCampaignCard[]> {
  if (process.env.NODE_ENV !== "production") return listPublicCampaignsUncached();
  return getCachedPublicCampaigns();
}

export async function listAdminCampaigns(): Promise<AdminCampaignRow[]> {
  const campaigns = await fetchCampaigns(true);
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const [statsByCampaignId, completedReceipts] = await Promise.all([
    fetchCampaignParticipationStats(campaignIds),
    prisma.receipt.findMany({
      where: {
        campaignId: { in: campaignIds },
        source: CAMPAIGN_ASSIGNMENT_SOURCE,
        status: CAMPAIGN_ASSIGNMENT_STATUS_COMPLETED,
      },
      select: { id: true, campaignId: true },
    }),
  ]);
  const receiptIds = completedReceipts.map((receipt) => receipt.id);
  const paidTransactions = receiptIds.length
    ? await prisma.pointTransaction.findMany({
        where: {
          idempotencyKey: {
            in: receiptIds.map(completionIdempotencyKey),
          },
        },
        select: { idempotencyKey: true, amount: true },
      })
    : [];
  const paidAmountByReceiptId = new Map<string, number>();
  for (const tx of paidTransactions) {
    const receiptId = tx.idempotencyKey.slice(CAMPAIGN_COMPLETION_IDEMPOTENCY_PREFIX.length);
    paidAmountByReceiptId.set(receiptId, (paidAmountByReceiptId.get(receiptId) ?? 0) + tx.amount);
  }

  const completedReceiptIdsByCampaignId = new Map<string, string[]>();
  for (const receipt of completedReceipts) {
    const ids = completedReceiptIdsByCampaignId.get(receipt.campaignId) ?? [];
    ids.push(receipt.id);
    completedReceiptIdsByCampaignId.set(receipt.campaignId, ids);
  }

  return campaigns.map((campaign) => {
    const completedReceiptIds = completedReceiptIdsByCampaignId.get(campaign.id) ?? [];
    const paidPointAmount = completedReceiptIds.reduce(
      (sum, receiptId) => sum + (paidAmountByReceiptId.get(receiptId) ?? 0),
      0,
    );
    const stats = {
      ...(statsByCampaignId.get(campaign.id) ?? emptyCampaignParticipationStats()),
      paidPointAmount,
    };
    const googlePlace = campaign.business.externalPlaces.find((place) => place.platform === "GOOGLE") ?? null;
    const naverPlace = campaign.business.externalPlaces.find((place) => place.platform === "NAVER") ?? null;
    const googleReviewCount = campaign.business.externalReviews.filter(
      (review) => review.platform === "GOOGLE",
    ).length;
    const naverReviewCount = campaign.business.externalReviews.filter(
      (review) => review.platform === "NAVER",
    ).length;
    const draftGuidance = normalizeCampaignDraftGuidance(campaign.draftGuidance);
    const draftSummary = summarizeCampaignReviewDraftSources({
      googlePlace,
      googleReviewCount,
      naverPlace,
      naverReferenceCount: campaign._count.blogReferences + naverReviewCount,
      category: googlePlace?.category ?? naverPlace?.category,
      businessName: googlePlace?.name ?? naverPlace?.name ?? campaign.business.name,
      industry: draftGuidance.industry,
      approvedFactCount: draftGuidance.approvedFacts.length,
      guideKeywordCount: draftGuidance.guideKeywords.length,
      reviewExampleCount: draftGuidance.reviewExamples.length,
    });
    return {
      ...toPublicCampaign(campaign, stats),
      active: campaign.active,
      assignedCount: stats.assignedCount,
      paidPointAmount: stats.paidPointAmount,
      menuCount: campaign.business._count.menus,
      issuedCodeCount: campaign._count.codes,
      blogReferenceCount: campaign._count.blogReferences,
      reviewReferenceCount: draftSummary.reviewReferenceCount,
      draftSourceGroupCount: draftSummary.sourceGroupCount,
      canGenerateReviewDraft: draftSummary.canGenerateReviewDraft,
      draftGuidance: {
        ...draftGuidance,
        industry: draftGuidance.industry ?? draftSummary.industry,
      },
      draftSourceGroups: draftSummary.sourceGroups,
      blogReferences: campaign.blogReferences.map(toAdminCampaignBlogReference),
      hasGooglePlace: Boolean(googlePlace),
      naverPlace: toAdminNaverPlace(campaign),
    };
  });
}
