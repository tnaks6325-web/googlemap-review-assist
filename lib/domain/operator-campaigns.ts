import { prisma } from "@/lib/db";
import {
  toAdminCampaignBlogReference,
  type AdminCampaignBlogReference,
} from "@/lib/domain/campaign-blog-references";
import {
  migrateLegacyCampaignPreparedDrafts,
  normalizeCampaignDraftGuidance,
  summarizeCampaignReviewDraftSources,
  type CampaignDraftGuidance,
} from "@/lib/domain/campaign-review-draft";
import {
  campaignAvailability,
  type CampaignAvailabilityReason,
} from "@/lib/domain/campaign-availability-policy";
import {
  CAMPAIGN_ASSIGNMENT_SOURCE,
  emptyCampaignParticipationStats,
  expireStaleCampaignAssignments,
  fetchCampaignParticipationStats,
} from "@/lib/domain/campaign-participation-stats";
import { summarizeAdminCampaignReviewSubmissions } from "@/lib/domain/admin-campaign-review-submissions";

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
  assignedTodayCount: number;
  completedTodayCount: number;
  totalQuota: number | null;
  dailyQuota: number | null;
  startDate: string | null;
  endDate: string | null;
  remainingTodayCount: number;
  remainingTotalCount: number;
  isAvailableToday: boolean;
  availabilityReason: CampaignAvailabilityReason;
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
  externalId: string | null;
  name: string;
  url: string | null;
  address: string | null;
  category: string | null;
  matchStatus: string;
  matchConfidence: number | null;
  syncedAt: string | null;
}

export interface AdminCampaignRow extends PublicCampaignCard {
  businessId: string;
  active: boolean;
  assignedCount: number;
  paidPointAmount: number;
  menuCount: number;
  issuedCodeCount: number;
  blogReferenceCount: number;
  reviewReferenceCount: number;
  submittedReviewCount: number;
  passedReviewCount: number;
  draftSourceGroupCount: number;
  canGenerateReviewDraft: boolean;
  preparedDraftMetrics: {
    totalCount: number;
    unassignedCount: number;
    qualityExcludedCount: number;
    assignedCount: number;
    batchCount: number;
  };
  draftGuidance: CampaignDraftGuidance;
  draftSourceGroups: {
    googlePlace: boolean;
    googleReviews: boolean;
    naverPlace: boolean;
    naverReferences: boolean;
  };
  blogReferences: AdminCampaignBlogReference[];
  hasGooglePlace: boolean;
  manualSetupEligible: boolean;
  naverPlace: AdminConnectedNaverPlace | null;
}

export const DEFAULT_REWARD_POINTS = 500;
const CAMPAIGN_ASSIGNMENT_STATUS_COMPLETED = "COMPLETED";
const CAMPAIGN_COMPLETION_IDEMPOTENCY_PREFIX = "campaign-complete:";

export function googleMapsSearchUrl(name: string, address: string | null, googlePlaceId: string | null) {
  if (googlePlaceId) {
    return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(googlePlaceId)}`;
  }
  const query = [name, address].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || name)}`;
}

function availabilityLabel(isAvailableToday: boolean, assignedTodayCount: number) {
  if (!isAvailableToday) return "오늘 모집 마감";
  if (assignedTodayCount === 0) return "오늘 참여 가능";
  return "참여 가능";
}

function statusLabel(active: boolean) {
  return active ? "진행 중" : "중지됨";
}

type CampaignWithBusiness = Awaited<ReturnType<typeof fetchCampaigns>>[number];
type CampaignForPresentation = Pick<
  CampaignWithBusiness,
  | "id"
  | "slug"
  | "name"
  | "active"
  | "businessId"
  | "createdAt"
  | "totalQuota"
  | "dailyQuota"
  | "startDate"
  | "endDate"
  | "rewardPoints"
> & {
  business: Pick<CampaignWithBusiness["business"], "name" | "address" | "googlePlaceId" | "externalPlaces">;
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
      sheetCampaignSource: { select: { sourceStatus: true } },
      _count: { select: { codes: true, blogReferences: true } },
    },
  });
}

function completionIdempotencyKey(receiptId: string) {
  return `${CAMPAIGN_COMPLETION_IDEMPOTENCY_PREFIX}${receiptId}`;
}

function toPublicCampaign(
  campaign: CampaignForPresentation,
  stats = emptyCampaignParticipationStats(),
  now = new Date(),
  sourceReady = true,
): PublicCampaignCard {
  const googlePlace = campaign.business.externalPlaces.find((place) => place.platform === "GOOGLE") ?? null;
  const businessName = googlePlace?.name ?? campaign.business.name;
  const address = googlePlace?.address ?? campaign.business.address;
  const availability = campaignAvailability(
    {
      active: campaign.active,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      totalQuota: campaign.totalQuota,
      dailyQuota: campaign.dailyQuota,
      assignedCount: stats.assignedCount,
      assignedTodayCount: stats.assignedTodayCount,
      sourceReady,
    },
    now,
  );
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
    assignedTodayCount: stats.assignedTodayCount,
    completedTodayCount: stats.completedTodayCount,
    totalQuota: campaign.totalQuota,
    dailyQuota: campaign.dailyQuota,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    remainingTodayCount: availability.remainingTodayCount,
    remainingTotalCount: availability.remainingTotalCount,
    isAvailableToday: availability.isAvailableToday,
    availabilityReason: availability.availabilityReason,
    rewardPoints: campaign.rewardPoints,
    availabilityLabel: availabilityLabel(
      availability.isAvailableToday,
      stats.assignedTodayCount,
    ),
    statusLabel: statusLabel(campaign.active),
    createdAt: campaign.createdAt,
  };
}

function toAdminNaverPlace(campaign: CampaignWithBusiness): AdminConnectedNaverPlace | null {
  const naverPlace = campaign.business.externalPlaces.find((place) => place.platform === "NAVER") ?? null;
  if (!naverPlace) return null;
  return {
    externalId: naverPlace.externalId,
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
  const now = new Date();
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
  const stats = (await fetchCampaignParticipationStats(prisma, [campaign.id], now)).get(campaign.id);

  return {
    ...toPublicCampaign(campaign, stats, now),
    active: campaign.active,
    businessId: campaign.businessId,
    menus: campaign.business.menus.map((menu) => ({
      id: menu.id,
      name: menu.name,
      category: menu.category,
    })),
  };
}

export async function getPublicCampaignDetail(slug: string): Promise<PublicCampaignDetail | null> {
  return getPublicCampaignDetailUncached(slug);
}

async function listPublicCampaignsUncached(): Promise<PublicCampaignCard[]> {
  const now = new Date();
  const campaigns = await fetchCampaigns(false);
  const statsByCampaignId = await fetchCampaignParticipationStats(
    prisma,
    campaigns.map((campaign) => campaign.id),
    now,
  );
  return campaigns
    .map((campaign) => toPublicCampaign(campaign, statsByCampaignId.get(campaign.id), now))
    .filter((campaign) => campaign.isAvailableToday);
}

export async function listPublicCampaigns(): Promise<PublicCampaignCard[]> {
  return listPublicCampaignsUncached();
}

export async function listAdminCampaigns(): Promise<AdminCampaignRow[]> {
  const now = new Date();
  await expireStaleCampaignAssignments(prisma, now);
  await migrateLegacyCampaignPreparedDrafts(undefined, prisma);
  const campaigns = await fetchCampaigns(true);
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const [
    statsByCampaignId,
    completedReceipts,
    unassignedPreparedDrafts,
    excludedPreparedDrafts,
    assignedPreparedDrafts,
    preparedDraftBatches,
    reviewSubmissionSummaries,
  ] = await Promise.all([
    fetchCampaignParticipationStats(prisma, campaignIds, now),
    prisma.receipt.findMany({
      where: {
        campaignId: { in: campaignIds },
        source: CAMPAIGN_ASSIGNMENT_SOURCE,
        status: CAMPAIGN_ASSIGNMENT_STATUS_COMPLETED,
      },
      select: { id: true, campaignId: true },
    }),
    prisma.campaignPreparedDraft.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: { in: campaignIds },
        qualityPassed: true,
        assignedReceiptId: null,
      },
      _count: { _all: true },
    }),
    prisma.campaignPreparedDraft.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: campaignIds }, qualityPassed: false },
      _count: { _all: true },
    }),
    prisma.campaignPreparedDraft.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: { in: campaignIds },
        qualityPassed: true,
        assignedReceiptId: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.campaignPreparedDraftBatch.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: campaignIds } },
      _count: { _all: true },
    }),
    summarizeAdminCampaignReviewSubmissions(campaignIds),
  ]);
  const preparedMetricsByCampaignId = new Map<
    string,
    AdminCampaignRow["preparedDraftMetrics"]
  >();

  const setPreparedCount = (
    campaignId: string,
    key: "unassignedCount" | "qualityExcludedCount" | "assignedCount",
    count: number,
  ) => {
    const metrics = preparedMetricsByCampaignId.get(campaignId) ?? {
      totalCount: 0,
      unassignedCount: 0,
      qualityExcludedCount: 0,
      assignedCount: 0,
      batchCount: 0,
    };
    metrics[key] = count;
    metrics.totalCount =
      metrics.unassignedCount + metrics.qualityExcludedCount + metrics.assignedCount;
    preparedMetricsByCampaignId.set(campaignId, metrics);
  };
  for (const row of unassignedPreparedDrafts) {
    setPreparedCount(row.campaignId, "unassignedCount", row._count._all);
  }
  for (const row of excludedPreparedDrafts) {
    setPreparedCount(row.campaignId, "qualityExcludedCount", row._count._all);
  }
  for (const row of assignedPreparedDrafts) {
    setPreparedCount(row.campaignId, "assignedCount", row._count._all);
  }
  for (const batch of preparedDraftBatches) {
    const metrics = preparedMetricsByCampaignId.get(batch.campaignId) ?? {
      totalCount: 0,
      unassignedCount: 0,
      qualityExcludedCount: 0,
      assignedCount: 0,
      batchCount: 0,
    };
    metrics.batchCount = batch._count._all;
    preparedMetricsByCampaignId.set(batch.campaignId, metrics);
  }
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
      ...toPublicCampaign(campaign, stats, now, draftSummary.canGenerateReviewDraft),
      businessId: campaign.businessId,
      active: campaign.active,
      assignedCount: stats.assignedCount,
      paidPointAmount: stats.paidPointAmount,
      menuCount: campaign.business._count.menus,
      issuedCodeCount: campaign._count.codes,
      blogReferenceCount: campaign._count.blogReferences,
      reviewReferenceCount: draftSummary.reviewReferenceCount,
      submittedReviewCount: reviewSubmissionSummaries.get(campaign.id)?.total ?? 0,
      passedReviewCount: reviewSubmissionSummaries.get(campaign.id)?.passed ?? 0,
      draftSourceGroupCount: draftSummary.sourceGroupCount,
      canGenerateReviewDraft: draftSummary.canGenerateReviewDraft,
      preparedDraftMetrics: preparedMetricsByCampaignId.get(campaign.id) ?? {
        totalCount: 0,
        unassignedCount: 0,
        qualityExcludedCount: 0,
        assignedCount: 0,
        batchCount: 0,
      },
      draftGuidance: {
        ...draftGuidance,
        industry: draftGuidance.industry ?? draftSummary.industry,
      },
      draftSourceGroups: draftSummary.sourceGroups,
      blogReferences: campaign.blogReferences.map(toAdminCampaignBlogReference),
      hasGooglePlace: Boolean(googlePlace),
      manualSetupEligible: campaign.sheetCampaignSource?.sourceStatus === "READY",
      naverPlace: toAdminNaverPlace(campaign),
    };
  });
}
