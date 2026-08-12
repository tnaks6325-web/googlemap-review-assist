import { randomBytes } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_REWARD_POINTS,
  googleMapsSearchUrl,
  type PublicCampaignCard,
} from "@/lib/domain/operator-campaigns";
import {
  CampaignReviewDraftError,
  generateCampaignReviewDraftForAssignment,
  normalizeCampaignDraftGuidance,
  summarizeCampaignReviewDraftSources,
  type CampaignReviewDraftResult,
} from "@/lib/domain/campaign-review-draft";
import type { ReviewProofAnalysis } from "@/lib/domain/review-proof-analysis";
import {
  assignmentExpiry,
  campaignAvailability,
} from "@/lib/domain/campaign-availability-policy";
import {
  effectiveCampaignAssignmentWhere,
  emptyCampaignParticipationStats,
  expireStaleCampaignAssignments,
  fetchCampaignParticipationStats,
  type CampaignParticipationStats,
} from "@/lib/domain/campaign-participation-stats";

export const REVIEWER_PLACE_COOLDOWN_DAYS = 7;
export const REVIEWER_ASSIGNMENT_STATUS_ASSIGNED = "ASSIGNED";
export const REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED = "REVIEW_SUBMITTED";
export const REVIEWER_ASSIGNMENT_STATUS_COMPLETED = "COMPLETED";
export const REVIEWER_ASSIGNMENT_STATUS_REJECTED = "REJECTED";
export const REVIEWER_ASSIGNMENT_STATUS_EXPIRED = "EXPIRED";
export const REVIEWER_ASSIGNMENT_SOURCE = "CAMPAIGN_ASSIGNMENT";

export interface ReviewerCampaignAssignment extends PublicCampaignCard {
  businessId: string;
  googlePlaceKey: string;
}

export interface ConcealedReviewerAssignment {
  rewardPoints: number;
}

export function toConcealedReviewerAssignment(
  campaign: ReviewerCampaignAssignment,
): ConcealedReviewerAssignment {
  return {
    rewardPoints: campaign.rewardPoints,
  };
}

export interface ReviewerCampaignAvailability {
  availableCount: number;
  totalRewardPoints: number;
  cooldownDays: number;
  categoryCounts: ReviewerCampaignCategoryCount[];
  campaigns: ReviewerCampaignAssignment[];
  activeAssignment: ReviewerActiveAssignment | null;
}

export interface ReviewerActiveAssignment {
  assignmentId: string;
  assignmentExpiresAt: Date;
  remainingSeconds: number;
  assignedCampaign: ReviewerCampaignAssignment;
  draft: ReviewerAssignedDraft | null;
}

export type ReviewerAssignedDraft = CampaignReviewDraftResult;

export interface ReviewerCampaignCategoryCount {
  category: string;
  count: number;
}

export class ReviewerCampaignError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export interface ReviewerCampaignProofInput {
  screenshotUrl: string;
  screenshotMimeType: string;
  screenshotOriginalName: string;
  draftText: string;
  analysis?: ReviewProofAnalysis;
  reprocess?: boolean;
  resubmissionNote?: string;
  submittedAt?: Date;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

type CampaignRow = Awaited<ReturnType<typeof fetchActiveCampaignRows>>[number];
type ReceiptRow = Awaited<ReturnType<typeof fetchCooldownReceiptRows>>[number];

function assertAssignmentNotExpired(
  receipt: {
    status: string;
    createdAt: Date;
    assignmentExpiresAt: Date | null;
  },
  now = new Date(),
) {
  if (receipt.status !== REVIEWER_ASSIGNMENT_STATUS_ASSIGNED) return;
  const expiresAt = receipt.assignmentExpiresAt ?? assignmentExpiry(receipt.createdAt);
  if (expiresAt.getTime() <= now.getTime()) {
    throw new ReviewerCampaignError(
      "ASSIGNMENT_EXPIRED",
      "배정 시간이 만료되었습니다. 다시 배정받아 주세요.",
      409,
    );
  }
}

function cooldownStart(now = new Date()) {
  return new Date(now.getTime() - REVIEWER_PLACE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}

function googlePlaceKeyForBusiness(
  business: {
    id: string;
    googlePlaceId: string | null;
    externalPlaces: Array<{ platform: string; externalId: string | null }>;
  },
) {
  return (
    business.externalPlaces.find((place) => place.platform === "GOOGLE")?.externalId ??
    business.googlePlaceId ??
    business.id
  );
}

function availabilityLabel(isAvailableToday: boolean, assignedTodayCount: number) {
  if (!isAvailableToday) return "오늘 참여 마감";
  return assignedTodayCount === 0 ? "오늘 참여 가능" : "참여 가능";
}

function statusLabel(active: boolean) {
  return active ? "진행 중" : "중지";
}

function normalizeCategory(category: string | null) {
  const source = category?.trim();
  if (!source) return "기타";

  const firstSegment = source
    .split(/[>·|/]/)
    .map((part) => part.trim())
    .find(Boolean);
  const value = (firstSegment || source).toLowerCase();

  if (/카페|커피|cafe|coffee/.test(value)) return "카페";
  if (/음식|식당|레스토랑|restaurant|food|meal|한식|중식|일식|양식|분식/.test(value)) return "음식점";
  if (/베이커리|제과|bakery/.test(value)) return "베이커리";
  if (/술집|바|bar|pub/.test(value)) return "주점";
  if (/미용|헤어|hair|beauty/.test(value)) return "미용";

  return firstSegment || source;
}

function buildCategoryCounts(campaigns: ReviewerCampaignAssignment[]): ReviewerCampaignCategoryCount[] {
  const counts = new Map<string, number>();
  for (const campaign of campaigns) {
    const category = normalizeCategory(campaign.category);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Array.from(counts, ([category, count]) => ({ category, count })).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.category === "기타") return 1;
    if (b.category === "기타") return -1;
    return a.category.localeCompare(b.category, "ko");
  });
}

async function fetchActiveCampaignRows(db: DbClient) {
  return db.campaign.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    include: {
      business: {
        select: {
          id: true,
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
            },
          },
          externalReviews: {
            where: { content: { not: null } },
            select: { id: true, platform: true, content: true },
            take: 50,
          },
        },
      },
      blogReferences: {
        where: { status: "ACTIVE" },
        select: { id: true, title: true, description: true },
        take: 5,
      },
      draftGuidance: true,
      draftEvidence: {
        select: { id: true, facet: true },
        take: 30,
      },
      preparedDrafts: {
        where: { qualityPassed: true, assignedReceiptId: null },
        select: { id: true },
        take: 1,
      },
    },
  });
}

async function fetchCooldownReceiptRows(db: DbClient, reviewerId: string, now = new Date()) {
  return db.receipt.findMany({
    where: {
      reviewerId,
      createdAt: { gte: cooldownStart(now) },
      ...effectiveCampaignAssignmentWhere(now),
    },
    select: {
      business: {
        select: {
          id: true,
          googlePlaceId: true,
          externalPlaces: {
            where: { platform: "GOOGLE" },
            take: 1,
            select: { platform: true, externalId: true },
          },
        },
      },
    },
  });
}

function toExcludedGooglePlaceKeys(receipts: ReceiptRow[]) {
  return new Set(receipts.map((receipt) => googlePlaceKeyForBusiness(receipt.business)));
}

function hasSufficientDraftSources(campaign: CampaignRow) {
  if (
    process.env.REVIEW_DRAFT_V2_ENABLED?.trim().toLowerCase() === "true" &&
    campaign.draftEvidence.length === 0
  ) {
    return false;
  }
  const googlePlace = campaign.business.externalPlaces.find((place) => place.platform === "GOOGLE") ?? null;
  const naverPlace = campaign.business.externalPlaces.find((place) => place.platform === "NAVER") ?? null;
  const googleReviewCount = campaign.business.externalReviews.filter(
    (review) => review.platform === "GOOGLE" && hasUsableReferenceText(review.content),
  ).length;
  const naverReviewCount = campaign.business.externalReviews.filter(
    (review) => review.platform === "NAVER" && hasUsableReferenceText(review.content),
  ).length;
  const blogReferenceCount = campaign.blogReferences.filter(
    (reference) =>
      hasUsableReferenceText(reference.title) || hasUsableReferenceText(reference.description),
  ).length;
  const draftGuidance = normalizeCampaignDraftGuidance(campaign.draftGuidance);

  return summarizeCampaignReviewDraftSources({
    googlePlace,
    googleReviewCount,
    naverPlace,
    naverReferenceCount: blogReferenceCount + naverReviewCount,
    category: googlePlace?.category ?? naverPlace?.category,
    businessName: googlePlace?.name ?? naverPlace?.name ?? campaign.business.name,
    industry: draftGuidance.industry,
    approvedFactCount: draftGuidance.approvedFacts.length,
  }).canGenerateReviewDraft;
}

function hasPreparedDraft(campaign: CampaignRow) {
  return campaign.preparedDrafts.length > 0;
}

function hasUsableReferenceText(value: string | null | undefined) {
  const normalized = (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > 0;
}

function toReviewerCampaign(
  campaign: CampaignRow,
  stats: CampaignParticipationStats,
  now: Date,
): ReviewerCampaignAssignment {
  const googlePlace = campaign.business.externalPlaces.find((place) => place.platform === "GOOGLE") ?? null;
  const businessName = googlePlace?.name ?? campaign.business.name;
  const address = googlePlace?.address ?? campaign.business.address;
  const googlePlaceKey = googlePlaceKeyForBusiness(campaign.business);
  const availability = campaignAvailability(
    {
      active: campaign.active,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      totalQuota: campaign.totalQuota,
      dailyQuota: campaign.dailyQuota,
      assignedCount: stats.assignedCount,
      assignedTodayCount: stats.assignedTodayCount,
      sourceReady: hasSufficientDraftSources(campaign),
    },
    now,
  );

  return {
    id: campaign.id,
    slug: campaign.slug,
    businessId: campaign.businessId,
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
    googlePlaceKey,
  };
}

export async function getReviewerCampaignAvailability(
  reviewerId: string,
  db: DbClient = prisma,
  now = new Date(),
): Promise<ReviewerCampaignAvailability> {
  await expireStaleCampaignAssignments(db, now);
  const [campaigns, cooldownReceipts] = await Promise.all([
    fetchActiveCampaignRows(db),
    fetchCooldownReceiptRows(db, reviewerId, now),
  ]);
  const statsByCampaignId = await fetchCampaignParticipationStats(
    db,
    campaigns.map((campaign) => campaign.id),
    now,
  );
  const excludedKeys = toExcludedGooglePlaceKeys(cooldownReceipts);
  const allCampaigns = campaigns.map((campaign) =>
    toReviewerCampaign(
      campaign,
      statsByCampaignId.get(campaign.id) ?? emptyCampaignParticipationStats(),
      now,
    ),
  );
  const campaignRowsById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const eligible = allCampaigns.filter(
    (campaign) => {
      const campaignRow = campaignRowsById.get(campaign.id);
      return Boolean(
        campaign.isAvailableToday &&
          campaignRow &&
          hasPreparedDraft(campaignRow) &&
          !excludedKeys.has(campaign.googlePlaceKey),
      );
    },
  );
  const activeReceipt = await db.receipt.findFirst({
    where: {
      reviewerId,
      status: REVIEWER_ASSIGNMENT_STATUS_ASSIGNED,
      ...effectiveCampaignAssignmentWhere(now),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      campaignId: true,
      createdAt: true,
      assignmentExpiresAt: true,
      rewardPoints: true,
      reviewDraftText: true,
      reviewDraftProvider: true,
      reviewDraftModel: true,
      reviewDraftSourceGroupsJson: true,
      reviewDraftGeneratedAt: true,
      reviewDraftVersion: true,
      reviewDraftSequence: true,
      reviewDraftStyleId: true,
      reviewDraftPromptVersion: true,
    },
  });
  const activeCampaign = activeReceipt
    ? allCampaigns.find((campaign) => campaign.id === activeReceipt.campaignId) ?? null
    : null;
  const activeCampaignWithSnapshot =
    activeCampaign && activeReceipt?.rewardPoints != null
      ? { ...activeCampaign, rewardPoints: activeReceipt.rewardPoints }
      : activeCampaign;
  const activeExpiresAt = activeReceipt
    ? activeReceipt.assignmentExpiresAt ?? assignmentExpiry(activeReceipt.createdAt)
    : null;
  const activeAssignment =
    activeReceipt && activeCampaignWithSnapshot && activeExpiresAt
      ? {
          assignmentId: activeReceipt.id,
          assignmentExpiresAt: activeExpiresAt,
          remainingSeconds: Math.max(
            0,
            Math.ceil((activeExpiresAt.getTime() - now.getTime()) / 1000),
          ),
          assignedCampaign: activeCampaignWithSnapshot,
          draft: toAssignedDraft(activeReceipt),
        }
      : null;

  return {
    availableCount: eligible.length,
    totalRewardPoints: eligible.reduce((sum, campaign) => sum + campaign.rewardPoints, 0),
    cooldownDays: REVIEWER_PLACE_COOLDOWN_DAYS,
    categoryCounts: buildCategoryCounts(eligible),
    campaigns: eligible,
    activeAssignment,
  };
}

async function getPublicCampaignAvailabilitySummaryUncached(db: DbClient) {
  const now = new Date();
  const rows = await fetchActiveCampaignRows(db);
  const statsByCampaignId = await fetchCampaignParticipationStats(
    db,
    rows.map((campaign) => campaign.id),
    now,
  );
  const campaigns = rows
    .map((campaign) =>
      toReviewerCampaign(
        campaign,
        statsByCampaignId.get(campaign.id) ?? emptyCampaignParticipationStats(),
        now,
      ),
    )
    .filter((campaign) => campaign.isAvailableToday);
  const preparedCampaignIds = new Set(
    rows.filter(hasPreparedDraft).map((campaign) => campaign.id),
  );
  const availableCampaigns = campaigns.filter((campaign) => preparedCampaignIds.has(campaign.id));
  return {
    availableCount: availableCampaigns.length,
    totalRewardPoints: availableCampaigns.reduce((sum, campaign) => sum + campaign.rewardPoints, 0),
    cooldownDays: REVIEWER_PLACE_COOLDOWN_DAYS,
    categoryCounts: buildCategoryCounts(availableCampaigns),
  };
}

export async function getPublicCampaignAvailabilitySummary(db: DbClient = prisma) {
  return getPublicCampaignAvailabilitySummaryUncached(db);
}

function randomIndex(length: number) {
  if (length <= 1) return 0;
  return randomBytes(4).readUInt32BE(0) % length;
}

function assignmentDedupeHash(reviewerId: string, googlePlaceKey: string) {
  return `assignment:${reviewerId}:${googlePlaceKey}:${Date.now()}:${randomBytes(4).toString("hex")}`;
}

function parsedSourceGroups(sourceGroupsJson: string | null) {
  if (!sourceGroupsJson) return [];
  try {
    const value = JSON.parse(sourceGroupsJson);
    return Array.isArray(value)
      ? (value as CampaignReviewDraftResult["sourceGroups"])
      : [];
  } catch {
    return [];
  }
}

function toAssignedDraft(receipt: {
  id: string;
  reviewDraftText: string | null;
  reviewDraftProvider: string | null;
  reviewDraftModel: string | null;
  reviewDraftSourceGroupsJson: string | null;
  reviewDraftGeneratedAt: Date | null;
  reviewDraftVersion: number;
  reviewDraftSequence: number | null;
  reviewDraftStyleId: string | null;
  reviewDraftPromptVersion: string | null;
}): ReviewerAssignedDraft | null {
  const text = receipt.reviewDraftText?.trim();
  if (!text) return null;
  const sourceGroups = parsedSourceGroups(receipt.reviewDraftSourceGroupsJson);
  return {
    assignmentId: receipt.id,
    text,
    provider: receipt.reviewDraftProvider ?? "prepared",
    model: receipt.reviewDraftModel ?? "prepared",
    sourceGroups,
    sourceGroupCount: sourceGroups.length,
    version: receipt.reviewDraftVersion || 1,
    generatedAt: (receipt.reviewDraftGeneratedAt ?? new Date()).toISOString(),
    reused: true,
    styleId: receipt.reviewDraftStyleId ?? undefined,
    slot: receipt.reviewDraftSequence ?? undefined,
    promptVersion: receipt.reviewDraftPromptVersion ?? undefined,
  };
}

function completionIdempotencyKey(assignmentId: string) {
  return `campaign-complete:${assignmentId}`;
}

async function completedAssignmentResult(db: DbClient, reviewerId: string, assignmentId: string) {
  const [tx, wallet, receipt] = await Promise.all([
    db.pointTransaction.findUnique({ where: { idempotencyKey: completionIdempotencyKey(assignmentId) } }),
    db.pointWallet.findUnique({ where: { reviewerId } }),
    db.receipt.findUnique({ where: { id: assignmentId }, select: { reviewProofImageUrl: true } }),
  ]);
  return {
    assignmentId,
    status: REVIEWER_ASSIGNMENT_STATUS_COMPLETED,
    earned: 0,
    balance: wallet?.balance ?? 0,
    alreadyCompleted: true,
    paidAmount: tx?.amount ?? 0,
    hasProofImage: Boolean(receipt?.reviewProofImageUrl),
  };
}

async function reviewerBalance(db: DbClient, reviewerId: string) {
  const wallet = await db.pointWallet.findUnique({ where: { reviewerId } });
  return wallet?.balance ?? 0;
}

export async function getReviewerCampaignProofContext(
  reviewerId: string,
  assignmentId: string,
  db: DbClient = prisma,
) {
  const cleanAssignmentId = assignmentId.trim();
  if (!cleanAssignmentId) {
    throw new ReviewerCampaignError("INVALID_ASSIGNMENT", "참여 정보를 확인해 주세요");
  }

  const receipt = await db.receipt.findUnique({
    where: { id: cleanAssignmentId },
    include: {
      business: {
        include: {
          externalPlaces: {
            where: { platform: "GOOGLE" },
            take: 1,
          },
        },
      },
    },
  });
  if (!receipt || receipt.reviewerId !== reviewerId) {
    throw new ReviewerCampaignError("ASSIGNMENT_NOT_FOUND", "참여 정보를 찾을 수 없어요", 404);
  }
  if (receipt.source !== REVIEWER_ASSIGNMENT_SOURCE) {
    throw new ReviewerCampaignError("INVALID_ASSIGNMENT", "캠페인 참여 기록이 아니에요", 422);
  }
  assertAssignmentNotExpired(receipt);

  const googlePlace = receipt.business.externalPlaces[0] ?? null;
  return {
    assignmentId: receipt.id,
    businessName: googlePlace?.name ?? receipt.business.name,
    reviewDraftText: receipt.reviewDraftText?.trim() ?? null,
  };
}

export async function getReviewerCampaignPlaceReveal(
  reviewerId: string,
  assignmentId: string,
  db: DbClient = prisma,
) {
  const cleanAssignmentId = assignmentId.trim();
  if (!cleanAssignmentId) {
    throw new ReviewerCampaignError(
      "INVALID_ASSIGNMENT",
      "참여 정보를 확인해 주세요.",
    );
  }

  const receipt = await db.receipt.findUnique({
    where: { id: cleanAssignmentId },
    include: {
      business: {
        include: {
          externalPlaces: {
            where: { platform: "GOOGLE" },
            take: 1,
          },
        },
      },
    },
  });

  if (!receipt || receipt.reviewerId !== reviewerId) {
    throw new ReviewerCampaignError(
      "ASSIGNMENT_NOT_FOUND",
      "참여 정보를 찾을 수 없어요.",
      404,
    );
  }
  if (receipt.source !== REVIEWER_ASSIGNMENT_SOURCE) {
    throw new ReviewerCampaignError(
      "INVALID_ASSIGNMENT",
      "캠페인 참여 기록이 아니에요.",
      422,
    );
  }
  assertAssignmentNotExpired(receipt);
  if (!receipt.reviewDraftText?.trim()) {
    throw new ReviewerCampaignError(
      "REVIEW_DRAFT_REQUIRED",
      "원고를 먼저 생성하고 복사해 주세요.",
      409,
    );
  }

  const googlePlace = receipt.business.externalPlaces[0] ?? null;
  const businessName = googlePlace?.name ?? receipt.business.name;
  const address = googlePlace?.address ?? receipt.business.address;

  return {
    businessName,
    address,
    category: googlePlace?.category ?? null,
    googleMapsUrl:
      googlePlace?.url ??
      googleMapsSearchUrl(
        businessName,
        address,
        receipt.business.googlePlaceId,
      ),
  };
}

async function approveCampaignAssignment(
  tx: Prisma.TransactionClient,
  receipt: {
    id: string;
    campaignId: string;
    reviewerId: string;
    reviewProofImageUrl: string | null;
    rewardPoints: number | null;
  },
  actor: string,
  note?: string | null,
) {
  if (!receipt.reviewProofImageUrl) {
    throw new ReviewerCampaignError("MISSING_PROOF", "제출된 캡처본이 없어요", 409);
  }

  const rewardPoints =
    receipt.rewardPoints ??
    (
      await tx.campaign.findUnique({
        where: { id: receipt.campaignId },
        select: { rewardPoints: true },
      })
    )?.rewardPoints ??
    DEFAULT_REWARD_POINTS;

  await tx.receipt.update({
    where: { id: receipt.id },
    data: {
      status: REVIEWER_ASSIGNMENT_STATUS_COMPLETED,
      reviewReviewedAt: new Date(),
      reviewReviewedBy: actor,
      reviewReviewNote: note?.trim() || null,
      rewardPoints,
    },
  });
  await tx.pointTransaction.create({
    data: {
      reviewerId: receipt.reviewerId,
      type: "EARN",
      amount: rewardPoints,
      idempotencyKey: completionIdempotencyKey(receipt.id),
      memo: "구글맵 리뷰 캡처 검수 승인",
    },
  });
  const wallet = await tx.pointWallet.upsert({
    where: { reviewerId: receipt.reviewerId },
    update: { balance: { increment: rewardPoints } },
    create: { reviewerId: receipt.reviewerId, balance: rewardPoints },
  });
  await tx.reviewerNotification.create({
    data: {
      reviewerId: receipt.reviewerId,
      type: "REVIEW_PROOF_APPROVED",
      title: "리뷰 검수가 승인됐어요",
      body: `${rewardPoints.toLocaleString("ko-KR")}P가 적립됐어요.`,
      metadataJson: JSON.stringify({ assignmentId: receipt.id }),
    },
  });

  return {
    assignmentId: receipt.id,
    status: REVIEWER_ASSIGNMENT_STATUS_COMPLETED,
    earned: rewardPoints,
    balance: wallet.balance,
    alreadyCompleted: false,
    paidAmount: rewardPoints,
    hasProofImage: Boolean(receipt.reviewProofImageUrl),
  };
}

interface AssignReviewerCampaignOptions {
  replaceAssignmentId?: string | null;
}

export async function assignReviewerCampaign(
  reviewerId: string,
  now = new Date(),
  options: AssignReviewerCampaignOptions = {},
) {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const availability = await getReviewerCampaignAvailability(reviewerId, tx, now);
          const replaceAssignmentId = options.replaceAssignmentId?.trim() || null;
          const replacementReceipt = replaceAssignmentId
            ? await tx.receipt.findUnique({
                where: { id: replaceAssignmentId },
                select: {
                  id: true,
                  reviewerId: true,
                  source: true,
                  status: true,
                },
              })
            : null;

          if (
            replaceAssignmentId &&
            (!replacementReceipt ||
              replacementReceipt.reviewerId !== reviewerId ||
              replacementReceipt.source !== REVIEWER_ASSIGNMENT_SOURCE)
          ) {
            throw new ReviewerCampaignError(
              "ASSIGNMENT_NOT_FOUND",
              "참여 정보를 찾을 수 없어요.",
              404,
            );
          }

          const replacingActiveAssignment = Boolean(
            replacementReceipt?.status === REVIEWER_ASSIGNMENT_STATUS_ASSIGNED &&
              (!availability.activeAssignment ||
                availability.activeAssignment.assignmentId === replacementReceipt.id),
          );

          if (replacingActiveAssignment && availability.campaigns.length === 0) {
            throw new ReviewerCampaignError(
              "NO_ALTERNATIVE_CAMPAIGN",
              "지금은 새로 배정할 다른 캠페인이 없어요.",
              409,
            );
          }

          if (replacingActiveAssignment && replacementReceipt) {
            await tx.receipt.update({
              where: { id: replacementReceipt.id },
              data: { status: REVIEWER_ASSIGNMENT_STATUS_EXPIRED },
            });
            await tx.campaignPreparedDraft.updateMany({
              where: { assignedReceiptId: replacementReceipt.id },
              data: { assignedReceiptId: null, assignedAt: null },
            });
          }

          if (availability.activeAssignment && !replacingActiveAssignment) {
            const draft =
              availability.activeAssignment.draft ??
              (await generateCampaignReviewDraftForAssignment(
                reviewerId,
                availability.activeAssignment.assignmentId,
                { now },
                tx,
              ));
            return {
              ...availability,
              activeAssignment: { ...availability.activeAssignment, draft },
              assignmentId: availability.activeAssignment.assignmentId,
              assignmentExpiresAt: availability.activeAssignment.assignmentExpiresAt,
              remainingSeconds: availability.activeAssignment.remainingSeconds,
              assignedCampaign: availability.activeAssignment.assignedCampaign,
              draft,
            };
          }

          const assignedCampaign =
            availability.campaigns[randomIndex(availability.campaigns.length)] ?? null;
          if (!assignedCampaign) {
            return {
              ...availability,
              assignmentId: null,
              assignmentExpiresAt: null,
              remainingSeconds: 0,
              assignedCampaign: null,
              draft: null,
            };
          }

          const expiresAt = assignmentExpiry(now);
          const receipt = await tx.receipt.create({
            data: {
              businessId: assignedCampaign.businessId,
              campaignId: assignedCampaign.id,
              reviewerId,
              code: `ASSIGN-${randomBytes(6).toString("hex").toUpperCase()}`,
              source: REVIEWER_ASSIGNMENT_SOURCE,
              dedupeHash: assignmentDedupeHash(reviewerId, assignedCampaign.googlePlaceKey),
              status: REVIEWER_ASSIGNMENT_STATUS_ASSIGNED,
              createdAt: now,
              assignmentExpiresAt: expiresAt,
              rewardPoints: assignedCampaign.rewardPoints,
            },
          });
          const draft = await generateCampaignReviewDraftForAssignment(
            reviewerId,
            receipt.id,
            { now },
            tx,
          );
          const activeAssignment = {
            assignmentId: receipt.id,
            assignmentExpiresAt: expiresAt,
            remainingSeconds: Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
            assignedCampaign,
            draft,
          };

          return {
            ...availability,
            activeAssignment,
            assignmentId: receipt.id,
            assignmentExpiresAt: expiresAt,
            remainingSeconds: activeAssignment.remainingSeconds,
            assignedCampaign,
            draft,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        },
      );
    } catch (error) {
      const retryable =
        (error instanceof CampaignReviewDraftError &&
          ["PREPARED_DRAFT_CLAIM_CONFLICT", "PREPARED_DRAFTS_EXHAUSTED"].includes(error.code)) ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
      if (!retryable) throw error;
      if (attempt === maxAttempts) {
        throw new ReviewerCampaignError(
          "ASSIGNMENT_CONFLICT",
          "동시에 많은 배정 요청이 발생했습니다. 잠시 후 다시 시도해 주세요.",
          409,
        );
      }
    }
  }
  throw new ReviewerCampaignError("ASSIGNMENT_CONFLICT", "캠페인 배정이 겹쳤습니다. 다시 시도해 주세요.", 409);
}

export async function submitReviewerCampaignProof(
  reviewerId: string,
  assignmentId: string,
  input: ReviewerCampaignProofInput,
) {
  const cleanAssignmentId = assignmentId.trim();
  if (!cleanAssignmentId) {
    throw new ReviewerCampaignError("INVALID_ASSIGNMENT", "참여 정보를 확인해 주세요");
  }
  if (!input.screenshotUrl || !input.screenshotMimeType || !input.screenshotOriginalName) {
    throw new ReviewerCampaignError("INVALID_PROOF", "구글맵 리뷰 캡처본을 첨부해 주세요");
  }
  const resubmissionNote = input.resubmissionNote?.trim() ?? "";
  if (resubmissionNote.length > 500) {
    throw new ReviewerCampaignError("INVALID_RESUBMISSION_NOTE", "보완 내용은 500자 이내로 입력해 주세요.");
  }
  const clientDraftText = input.draftText.trim();
  if (clientDraftText.length < 0) {
    throw new ReviewerCampaignError("INVALID_DRAFT", "생성된 리뷰 원고를 확인해 주세요");
  }

  const submittedAt = input.submittedAt ?? new Date();
  const expiryCandidate = await prisma.receipt.findUnique({
    where: { id: cleanAssignmentId },
    select: {
      reviewerId: true,
      status: true,
      createdAt: true,
      assignmentExpiresAt: true,
    },
  });
  if (
    expiryCandidate?.reviewerId === reviewerId &&
    expiryCandidate.status === REVIEWER_ASSIGNMENT_STATUS_ASSIGNED
  ) {
    const expiresAt =
      expiryCandidate.assignmentExpiresAt ?? assignmentExpiry(expiryCandidate.createdAt);
    if (expiresAt.getTime() <= submittedAt.getTime()) {
      await prisma.receipt.updateMany({
        where: {
          id: cleanAssignmentId,
          reviewerId,
          status: REVIEWER_ASSIGNMENT_STATUS_ASSIGNED,
        },
        data: { status: REVIEWER_ASSIGNMENT_STATUS_EXPIRED },
      });
      throw new ReviewerCampaignError(
        "ASSIGNMENT_EXPIRED",
        "배정 시간이 만료되었습니다. 다시 배정받아 주세요.",
        409,
      );
    }
  }
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.findUnique({ where: { id: cleanAssignmentId } });
    if (!receipt || receipt.reviewerId !== reviewerId) {
      throw new ReviewerCampaignError("ASSIGNMENT_NOT_FOUND", "참여 정보를 찾을 수 없어요", 404);
    }
    if (receipt.source !== REVIEWER_ASSIGNMENT_SOURCE) {
      throw new ReviewerCampaignError("INVALID_ASSIGNMENT", "캠페인 참여 기록이 아니에요", 422);
    }
    assertAssignmentNotExpired(receipt, submittedAt);
    if (receipt.status === REVIEWER_ASSIGNMENT_STATUS_COMPLETED) {
      return completedAssignmentResult(tx, reviewerId, receipt.id);
    }
    if (receipt.status === REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED && !input.reprocess) {
      return {
        assignmentId: receipt.id,
        status: REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED,
        earned: 0,
        balance: await reviewerBalance(tx, reviewerId),
        pendingApproval: true,
        hasProofImage: Boolean(receipt.reviewProofImageUrl),
      };
    }
    if (
      ![
        REVIEWER_ASSIGNMENT_STATUS_ASSIGNED,
        "VERIFIED",
        REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED,
        REVIEWER_ASSIGNMENT_STATUS_REJECTED,
      ].includes(receipt.status)
    ) {
      throw new ReviewerCampaignError("BAD_ASSIGNMENT_STATE", "검수 요청할 수 없는 참여 상태예요", 409);
    }

    const draftText = receipt.reviewDraftText?.trim() ?? "";
    if (draftText.length < 10) {
      throw new ReviewerCampaignError("MISSING_REVIEW_DRAFT", "서버에 저장된 리뷰 원고가 없습니다.", 409);
    }

    const analysis = input.analysis;
    const baseUpdate = {
      reviewDraftText: draftText.slice(0, 4000),
      reviewProofImageUrl: input.screenshotUrl,
      reviewProofMimeType: input.screenshotMimeType,
      reviewProofOriginalName: input.screenshotOriginalName.slice(0, 255),
      reviewProofSubmittedAt: submittedAt,
      reviewProofExtractedText: analysis?.extractedText.slice(0, 4000) ?? null,
      reviewProofSimilarity: analysis?.similarity ?? null,
      reviewProofAnalysisStatus: analysis?.status ?? null,
      reviewProofAnalysisReason: analysis?.reason ?? null,
      reviewProofAnalysisProvider: analysis?.provider ?? null,
      reviewProofAnalysisJson: analysis ? JSON.stringify(analysis).slice(0, 4000) : null,
      reviewReviewedAt: null,
      reviewReviewedBy: null,
      reviewReviewNote:
        receipt.status === REVIEWER_ASSIGNMENT_STATUS_REJECTED && resubmissionNote
          ? `보완 제출: ${resubmissionNote}`
          : null,
    };

    const status =
      analysis?.status === "AUTO_APPROVE"
        ? REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED
        : analysis?.status === "AUTO_REJECT"
          ? REVIEWER_ASSIGNMENT_STATUS_REJECTED
          : REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED;

    const updated = await tx.receipt.update({
      where: { id: receipt.id },
      data: {
        ...baseUpdate,
        status,
        ...(analysis?.status === "AUTO_REJECT"
          ? {
              reviewReviewedAt: submittedAt,
              reviewReviewedBy: `ai:${analysis.provider}`,
              reviewReviewNote: "이미지 분석 결과 생성 원고와 일치하지 않아 자동 반려됐습니다.",
            }
          : {}),
      },
    });

    if (analysis?.status === "AUTO_APPROVE") {
      const approved = await approveCampaignAssignment(
        tx,
        {
          id: updated.id,
          campaignId: updated.campaignId,
          reviewerId: updated.reviewerId,
          reviewProofImageUrl: updated.reviewProofImageUrl,
          rewardPoints: updated.rewardPoints,
        },
        `ai:${analysis.provider}`,
        "이미지 분석 결과 생성 원고와 유사도가 높아 자동 승인됐습니다.",
      );
      return { ...approved, analysis };
    }

    if (analysis?.status === "AUTO_REJECT") {
      await tx.reviewerNotification.create({
        data: {
          reviewerId,
          type: "REVIEW_PROOF_REJECTED",
          title: "리뷰 검수가 자동 반려됐어요",
          body: "제출한 캡처본에서 생성 원고와 일치하는 리뷰를 확인하지 못했어요.",
          metadataJson: JSON.stringify({ assignmentId: updated.id, similarity: analysis.similarity }),
        },
      });
      return {
        assignmentId: updated.id,
        status: updated.status,
        earned: 0,
        balance: await reviewerBalance(tx, reviewerId),
        pendingApproval: false,
        hasProofImage: Boolean(updated.reviewProofImageUrl),
        analysis,
      };
    }

    return {
      assignmentId: updated.id,
      status: updated.status,
      earned: 0,
      balance: await reviewerBalance(tx, reviewerId),
      pendingApproval: true,
      hasProofImage: Boolean(updated.reviewProofImageUrl),
      analysis: analysis ?? null,
    };
  });
}

export async function completeReviewerCampaignAssignment(
  assignmentId: string,
  actor: string,
  note?: string,
) {
  const cleanAssignmentId = assignmentId.trim();
  if (!cleanAssignmentId) {
    throw new ReviewerCampaignError("INVALID_ASSIGNMENT", "참여 정보를 확인해 주세요");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.findUnique({ where: { id: cleanAssignmentId } });
      if (!receipt) {
        throw new ReviewerCampaignError("ASSIGNMENT_NOT_FOUND", "참여 정보를 찾을 수 없어요", 404);
      }
      if (receipt.source !== REVIEWER_ASSIGNMENT_SOURCE) {
        throw new ReviewerCampaignError("INVALID_ASSIGNMENT", "캠페인 참여 기록이 아니에요", 422);
      }
      if (receipt.status === REVIEWER_ASSIGNMENT_STATUS_COMPLETED) {
        return completedAssignmentResult(tx, receipt.reviewerId, receipt.id);
      }
      if (
        receipt.status !== REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED &&
        receipt.status !== REVIEWER_ASSIGNMENT_STATUS_REJECTED
      ) {
        throw new ReviewerCampaignError(
          "BAD_ASSIGNMENT_STATE",
          "검수 대기 또는 반려된 참여만 승인할 수 있어요",
          409,
        );
      }

      return approveCampaignAssignment(
        tx,
        {
          id: receipt.id,
          campaignId: receipt.campaignId,
          reviewerId: receipt.reviewerId,
          reviewProofImageUrl: receipt.reviewProofImageUrl,
          rewardPoints: receipt.rewardPoints,
        },
        actor,
        note,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const receipt = await prisma.receipt.findUnique({ where: { id: cleanAssignmentId } });
      if (receipt) return completedAssignmentResult(prisma, receipt.reviewerId, cleanAssignmentId);
    }
    throw e;
  }
}

export async function rejectReviewerCampaignProof(
  assignmentId: string,
  actor: string,
  note?: string,
) {
  const cleanAssignmentId = assignmentId.trim();
  if (!cleanAssignmentId) {
    throw new ReviewerCampaignError("INVALID_ASSIGNMENT", "참여 정보를 확인해 주세요");
  }

  return prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.findUnique({ where: { id: cleanAssignmentId } });
    if (!receipt) throw new ReviewerCampaignError("ASSIGNMENT_NOT_FOUND", "참여 정보를 찾을 수 없어요", 404);
    if (receipt.source !== REVIEWER_ASSIGNMENT_SOURCE) {
      throw new ReviewerCampaignError("INVALID_ASSIGNMENT", "캠페인 참여 기록이 아니에요", 422);
    }
    if (
      receipt.status !== REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED &&
      receipt.status !== REVIEWER_ASSIGNMENT_STATUS_REJECTED
    ) {
      throw new ReviewerCampaignError(
        "BAD_ASSIGNMENT_STATE",
        "검수 대기 또는 반려된 참여만 반려할 수 있어요",
        409,
      );
    }

    const alreadyRejected = receipt.status === REVIEWER_ASSIGNMENT_STATUS_REJECTED;

    const updated = await tx.receipt.update({
      where: { id: receipt.id },
      data: {
        status: REVIEWER_ASSIGNMENT_STATUS_REJECTED,
        reviewReviewedAt: new Date(),
        reviewReviewedBy: actor,
        reviewReviewNote:
          note?.trim() ||
          (alreadyRejected
            ? "관리자 육안 검수 결과 반려를 확정했습니다."
            : "캡처본 확인이 필요합니다."),
      },
    });
    if (!alreadyRejected) {
      await tx.reviewerNotification.create({
        data: {
          reviewerId: receipt.reviewerId,
          type: "REVIEW_PROOF_REJECTED",
          title: "리뷰 검수가 반려됐어요",
          body: updated.reviewReviewNote ?? "캡처본 확인이 필요합니다.",
          metadataJson: JSON.stringify({ assignmentId: receipt.id }),
        },
      });
    }

    return {
      assignmentId: updated.id,
      status: updated.status,
      earned: 0,
      balance: await reviewerBalance(tx, receipt.reviewerId),
      pendingApproval: false,
      alreadyRejected,
      hasProofImage: Boolean(updated.reviewProofImageUrl),
    };
  });
}
