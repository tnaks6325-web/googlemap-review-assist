import { randomBytes } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import {
  DEFAULT_REWARD_POINTS,
  googleMapsSearchUrl,
  type PublicCampaignCard,
} from "@/lib/domain/operator-campaigns";
import { summarizeCampaignReviewDraftSources } from "@/lib/domain/campaign-review-draft";
import type { ReviewProofAnalysis } from "@/lib/domain/review-proof-analysis";

export const REVIEWER_PLACE_COOLDOWN_DAYS = 7;
export const REVIEWER_ASSIGNMENT_STATUS_ASSIGNED = "ASSIGNED";
export const REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED = "REVIEW_SUBMITTED";
export const REVIEWER_ASSIGNMENT_STATUS_COMPLETED = "COMPLETED";
export const REVIEWER_ASSIGNMENT_STATUS_REJECTED = "REJECTED";
export const REVIEWER_ASSIGNMENT_SOURCE = "CAMPAIGN_ASSIGNMENT";
const PUBLIC_AVAILABILITY_CACHE_SECONDS = 10;

export interface ReviewerCampaignAssignment extends PublicCampaignCard {
  businessId: string;
  googlePlaceKey: string;
}

export interface ReviewerCampaignAvailability {
  availableCount: number;
  totalRewardPoints: number;
  cooldownDays: number;
  categoryCounts: ReviewerCampaignCategoryCount[];
  campaigns: ReviewerCampaignAssignment[];
}

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
}

type DbClient = PrismaClient | Prisma.TransactionClient;

type CampaignRow = Awaited<ReturnType<typeof fetchActiveCampaignRows>>[number];
type ReceiptRow = Awaited<ReturnType<typeof fetchCooldownReceiptRows>>[number];

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

function availabilityLabel(completedCount: number) {
  if (completedCount === 0) return "참여 가능";
  if (completedCount < 5) return "오늘 참여 가능";
  return "참여 가능";
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
      _count: {
        select: {
          receipts: {
            where: {
              source: REVIEWER_ASSIGNMENT_SOURCE,
              status: REVIEWER_ASSIGNMENT_STATUS_COMPLETED,
            },
          },
        },
      },
    },
  });
}

async function fetchCooldownReceiptRows(db: DbClient, reviewerId: string, now = new Date()) {
  return db.receipt.findMany({
    where: {
      reviewerId,
      createdAt: { gte: cooldownStart(now) },
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

function completedAssignmentCount(campaign: CampaignRow) {
  return campaign._count.receipts;
}

function hasSufficientDraftSources(campaign: CampaignRow) {
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

  return summarizeCampaignReviewDraftSources({
    googlePlace,
    googleReviewCount,
    naverPlace,
    naverReferenceCount: blogReferenceCount + naverReviewCount,
  }).canGenerateReviewDraft;
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

function toReviewerCampaign(campaign: CampaignRow): ReviewerCampaignAssignment {
  const googlePlace = campaign.business.externalPlaces.find((place) => place.platform === "GOOGLE") ?? null;
  const businessName = googlePlace?.name ?? campaign.business.name;
  const address = googlePlace?.address ?? campaign.business.address;
  const googlePlaceKey = googlePlaceKeyForBusiness(campaign.business);
  const completedCount = completedAssignmentCount(campaign);

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
    completedCount,
    rewardPoints: DEFAULT_REWARD_POINTS,
    availabilityLabel: availabilityLabel(completedCount),
    statusLabel: statusLabel(campaign.active),
    createdAt: campaign.createdAt,
    googlePlaceKey,
  };
}

export async function getReviewerCampaignAvailability(
  reviewerId: string,
  db: DbClient = prisma,
): Promise<ReviewerCampaignAvailability> {
  const [campaigns, cooldownReceipts] = await Promise.all([
    fetchActiveCampaignRows(db),
    fetchCooldownReceiptRows(db, reviewerId),
  ]);
  const excludedKeys = toExcludedGooglePlaceKeys(cooldownReceipts);
  const eligible = campaigns
    .filter(hasSufficientDraftSources)
    .map(toReviewerCampaign)
    .filter((campaign) => !excludedKeys.has(campaign.googlePlaceKey));

  return {
    availableCount: eligible.length,
    totalRewardPoints: eligible.reduce((sum, campaign) => sum + campaign.rewardPoints, 0),
    cooldownDays: REVIEWER_PLACE_COOLDOWN_DAYS,
    categoryCounts: buildCategoryCounts(eligible),
    campaigns: eligible,
  };
}

async function getPublicCampaignAvailabilitySummaryUncached(db: DbClient) {
  const campaigns = (await fetchActiveCampaignRows(db))
    .filter(hasSufficientDraftSources)
    .map(toReviewerCampaign);
  return {
    availableCount: campaigns.length,
    totalRewardPoints: campaigns.reduce((sum, campaign) => sum + campaign.rewardPoints, 0),
    cooldownDays: REVIEWER_PLACE_COOLDOWN_DAYS,
    categoryCounts: buildCategoryCounts(campaigns),
  };
}

const getCachedPublicCampaignAvailabilitySummary = unstable_cache(
  async () => getPublicCampaignAvailabilitySummaryUncached(prisma),
  ["reviewer-public-campaign-availability"],
  { revalidate: PUBLIC_AVAILABILITY_CACHE_SECONDS, tags: ["public-campaigns"] },
);

export async function getPublicCampaignAvailabilitySummary(db: DbClient = prisma) {
  if (db !== prisma || process.env.NODE_ENV !== "production") {
    return getPublicCampaignAvailabilitySummaryUncached(db);
  }
  return getCachedPublicCampaignAvailabilitySummary();
}

function randomIndex(length: number) {
  if (length <= 1) return 0;
  return randomBytes(4).readUInt32BE(0) % length;
}

function assignmentDedupeHash(reviewerId: string, googlePlaceKey: string) {
  return `assignment:${reviewerId}:${googlePlaceKey}:${Date.now()}:${randomBytes(4).toString("hex")}`;
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

  const googlePlace = receipt.business.externalPlaces[0] ?? null;
  return {
    assignmentId: receipt.id,
    businessName: googlePlace?.name ?? receipt.business.name,
    reviewDraftText: receipt.reviewDraftText?.trim() ?? null,
  };
}

async function approveCampaignAssignment(
  tx: Prisma.TransactionClient,
  receipt: {
    id: string;
    reviewerId: string;
    reviewProofImageUrl: string | null;
  },
  actor: string,
  note?: string | null,
) {
  if (!receipt.reviewProofImageUrl) {
    throw new ReviewerCampaignError("MISSING_PROOF", "제출된 캡처본이 없어요", 409);
  }

  await tx.receipt.update({
    where: { id: receipt.id },
    data: {
      status: REVIEWER_ASSIGNMENT_STATUS_COMPLETED,
      reviewReviewedAt: new Date(),
      reviewReviewedBy: actor,
      reviewReviewNote: note?.trim() || null,
    },
  });
  await tx.pointTransaction.create({
    data: {
      reviewerId: receipt.reviewerId,
      type: "EARN",
      amount: DEFAULT_REWARD_POINTS,
      idempotencyKey: completionIdempotencyKey(receipt.id),
      memo: "구글맵 리뷰 캡처 검수 승인",
    },
  });
  const wallet = await tx.pointWallet.upsert({
    where: { reviewerId: receipt.reviewerId },
    update: { balance: { increment: DEFAULT_REWARD_POINTS } },
    create: { reviewerId: receipt.reviewerId, balance: DEFAULT_REWARD_POINTS },
  });
  await tx.reviewerNotification.create({
    data: {
      reviewerId: receipt.reviewerId,
      type: "REVIEW_PROOF_APPROVED",
      title: "리뷰 검수가 승인됐어요",
      body: `${DEFAULT_REWARD_POINTS.toLocaleString("ko-KR")}P가 적립됐어요.`,
      metadataJson: JSON.stringify({ assignmentId: receipt.id }),
    },
  });

  return {
    assignmentId: receipt.id,
    status: REVIEWER_ASSIGNMENT_STATUS_COMPLETED,
    earned: DEFAULT_REWARD_POINTS,
    balance: wallet.balance,
    alreadyCompleted: false,
    paidAmount: DEFAULT_REWARD_POINTS,
    hasProofImage: Boolean(receipt.reviewProofImageUrl),
  };
}

export async function assignReviewerCampaign(reviewerId: string) {
  return prisma.$transaction(async (tx) => {
    const availability = await getReviewerCampaignAvailability(reviewerId, tx);
    const assignedCampaign = availability.campaigns[randomIndex(availability.campaigns.length)] ?? null;

    if (!assignedCampaign) {
      return {
        ...availability,
        assignmentId: null,
        assignedCampaign: null,
      };
    }

    const receipt = await tx.receipt.create({
      data: {
        businessId: assignedCampaign.businessId,
        campaignId: assignedCampaign.id,
        reviewerId,
        code: `ASSIGN-${randomBytes(6).toString("hex").toUpperCase()}`,
        source: REVIEWER_ASSIGNMENT_SOURCE,
        dedupeHash: assignmentDedupeHash(reviewerId, assignedCampaign.googlePlaceKey),
        status: REVIEWER_ASSIGNMENT_STATUS_ASSIGNED,
      },
    });

    return {
      ...availability,
      assignmentId: receipt.id,
      assignedCampaign,
    };
  });
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
  const clientDraftText = input.draftText.trim();
  if (clientDraftText.length < 0) {
    throw new ReviewerCampaignError("INVALID_DRAFT", "생성된 리뷰 원고를 확인해 주세요");
  }

  return prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.findUnique({ where: { id: cleanAssignmentId } });
    if (!receipt || receipt.reviewerId !== reviewerId) {
      throw new ReviewerCampaignError("ASSIGNMENT_NOT_FOUND", "참여 정보를 찾을 수 없어요", 404);
    }
    if (receipt.source !== REVIEWER_ASSIGNMENT_SOURCE) {
      throw new ReviewerCampaignError("INVALID_ASSIGNMENT", "캠페인 참여 기록이 아니에요", 422);
    }
    if (receipt.status === REVIEWER_ASSIGNMENT_STATUS_COMPLETED) {
      return completedAssignmentResult(tx, reviewerId, receipt.id);
    }
    if (receipt.status === REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED) {
      return {
        assignmentId: receipt.id,
        status: REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED,
        earned: 0,
        balance: await reviewerBalance(tx, reviewerId),
        pendingApproval: true,
        hasProofImage: Boolean(receipt.reviewProofImageUrl),
      };
    }
    if (![REVIEWER_ASSIGNMENT_STATUS_ASSIGNED, "VERIFIED"].includes(receipt.status)) {
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
      reviewProofSubmittedAt: new Date(),
      reviewProofExtractedText: analysis?.extractedText.slice(0, 4000) ?? null,
      reviewProofSimilarity: analysis?.similarity ?? null,
      reviewProofAnalysisStatus: analysis?.status ?? null,
      reviewProofAnalysisReason: analysis?.reason ?? null,
      reviewProofAnalysisProvider: analysis?.provider ?? null,
      reviewProofAnalysisJson: analysis ? JSON.stringify(analysis).slice(0, 4000) : null,
      reviewReviewedAt: null,
      reviewReviewedBy: null,
      reviewReviewNote: null,
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
              reviewReviewedAt: new Date(),
              reviewReviewedBy: `ai:${analysis.provider}`,
              reviewReviewNote: "이미지 분석 결과 생성 원고와 일치하지 않아 자동 반려됐습니다.",
            }
          : {}),
      },
    });

    if (analysis?.status === "AUTO_APPROVE") {
      const approved = await approveCampaignAssignment(
        tx,
        { id: updated.id, reviewerId: updated.reviewerId, reviewProofImageUrl: updated.reviewProofImageUrl },
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
      if (receipt.status !== REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED) {
        throw new ReviewerCampaignError("BAD_ASSIGNMENT_STATE", "검수 대기 중인 참여만 승인할 수 있어요", 409);
      }

      return approveCampaignAssignment(
        tx,
        { id: receipt.id, reviewerId: receipt.reviewerId, reviewProofImageUrl: receipt.reviewProofImageUrl },
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
    if (receipt.status !== REVIEWER_ASSIGNMENT_STATUS_REVIEW_SUBMITTED) {
      throw new ReviewerCampaignError("BAD_ASSIGNMENT_STATE", "검수 대기 중인 참여만 반려할 수 있어요", 409);
    }

    const updated = await tx.receipt.update({
      where: { id: receipt.id },
      data: {
        status: REVIEWER_ASSIGNMENT_STATUS_REJECTED,
        reviewReviewedAt: new Date(),
        reviewReviewedBy: actor,
        reviewReviewNote: note?.trim() || "캡처본 확인이 필요합니다.",
      },
    });
    await tx.reviewerNotification.create({
      data: {
        reviewerId: receipt.reviewerId,
        type: "REVIEW_PROOF_REJECTED",
        title: "리뷰 검수가 반려됐어요",
        body: updated.reviewReviewNote ?? "캡처본 확인이 필요합니다.",
        metadataJson: JSON.stringify({ assignmentId: receipt.id }),
      },
    });

    return {
      assignmentId: updated.id,
      status: updated.status,
      earned: 0,
      balance: await reviewerBalance(tx, receipt.reviewerId),
      pendingApproval: false,
      hasProofImage: Boolean(updated.reviewProofImageUrl),
    };
  });
}
