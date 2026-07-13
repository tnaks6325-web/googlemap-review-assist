import { prisma } from "@/lib/db";
import {
  toAdminCampaignBlogReference,
  type AdminCampaignBlogReference,
} from "@/lib/domain/campaign-blog-references";
import { summarizeCampaignReviewDraftSources } from "@/lib/domain/campaign-review-draft";

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
        include: {
          externalPlaces: {
            where: { platform: { in: ["GOOGLE", "NAVER"] } },
          },
          externalReviews: {
            where: { content: { not: null } },
            select: { id: true, platform: true },
            take: 50,
          },
          _count: { select: { menus: true } },
        },
      },
      receipts: { select: { id: true, source: true, status: true } },
      blogReferences: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      _count: { select: { codes: true, blogReferences: true } },
    },
  });
}

function campaignParticipationStats(
  campaign: CampaignWithBusiness,
  paidPointAmount?: number,
): CampaignParticipationStats {
  const assignmentReceipts = campaign.receipts.filter(
    (receipt) => receipt.source === CAMPAIGN_ASSIGNMENT_SOURCE,
  );
  const completedReceipts = assignmentReceipts.filter(
    (receipt) => receipt.status === CAMPAIGN_ASSIGNMENT_STATUS_COMPLETED,
  );
  return {
    assignedCount: assignmentReceipts.length,
    completedCount: completedReceipts.length,
    paidPointAmount: paidPointAmount ?? completedReceipts.length * DEFAULT_REWARD_POINTS,
  };
}

function completedReceiptIds(campaign: CampaignWithBusiness) {
  return campaign.receipts
    .filter(
      (receipt) =>
        receipt.source === CAMPAIGN_ASSIGNMENT_SOURCE &&
        receipt.status === CAMPAIGN_ASSIGNMENT_STATUS_COMPLETED,
    )
    .map((receipt) => receipt.id);
}

function completionIdempotencyKey(receiptId: string) {
  return `${CAMPAIGN_COMPLETION_IDEMPOTENCY_PREFIX}${receiptId}`;
}

function toPublicCampaign(
  campaign: CampaignWithBusiness,
  stats = campaignParticipationStats(campaign),
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

export async function getPublicCampaignDetail(slug: string): Promise<PublicCampaignDetail | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { slug },
    include: {
      business: {
        include: {
          menus: true,
          externalPlaces: {
            where: { platform: "GOOGLE" },
            take: 1,
          },
          externalReviews: {
            where: { content: { not: null } },
            select: { id: true, platform: true },
            take: 0,
          },
          _count: { select: { menus: true } },
        },
      },
      receipts: { select: { id: true, source: true, status: true } },
      blogReferences: { take: 0 },
      _count: { select: { codes: true, blogReferences: true } },
    },
  });
  if (!campaign) return null;

  return {
    ...toPublicCampaign(campaign),
    active: campaign.active,
    businessId: campaign.businessId,
    menus: campaign.business.menus.map((menu) => ({
      id: menu.id,
      name: menu.name,
      category: menu.category,
    })),
  };
}

export async function listPublicCampaigns(): Promise<PublicCampaignCard[]> {
  const campaigns = await fetchCampaigns(false);
  return campaigns.map((campaign) => toPublicCampaign(campaign));
}

export async function listAdminCampaigns(): Promise<AdminCampaignRow[]> {
  const campaigns = await fetchCampaigns(true);
  const receiptIds = campaigns.flatMap(completedReceiptIds);
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

  return campaigns.map((campaign) => {
    const paidPointAmount = completedReceiptIds(campaign).reduce(
      (sum, receiptId) => sum + (paidAmountByReceiptId.get(receiptId) ?? 0),
      0,
    );
    const stats = campaignParticipationStats(campaign, paidPointAmount);
    const googlePlace = campaign.business.externalPlaces.find((place) => place.platform === "GOOGLE") ?? null;
    const naverPlace = campaign.business.externalPlaces.find((place) => place.platform === "NAVER") ?? null;
    const googleReviewCount = campaign.business.externalReviews.filter(
      (review) => review.platform === "GOOGLE",
    ).length;
    const naverReviewCount = campaign.business.externalReviews.filter(
      (review) => review.platform === "NAVER",
    ).length;
    const draftSummary = summarizeCampaignReviewDraftSources({
      googlePlace,
      googleReviewCount,
      naverPlace,
      naverReferenceCount: campaign._count.blogReferences + naverReviewCount,
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
      draftSourceGroups: draftSummary.sourceGroups,
      blogReferences: campaign.blogReferences.map(toAdminCampaignBlogReference),
      hasGooglePlace: Boolean(googlePlace),
      naverPlace: toAdminNaverPlace(campaign),
    };
  });
}
