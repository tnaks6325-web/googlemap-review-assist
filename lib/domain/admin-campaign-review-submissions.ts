import { prisma } from "@/lib/db";

const CAMPAIGN_ASSIGNMENT_SOURCE = "CAMPAIGN_ASSIGNMENT";

export type AdminCampaignReviewDecisionStatus = "PENDING" | "PASSED" | "FAILED";

export interface AdminCampaignReviewSubmissionItem {
  id: string;
  reviewerLabel: string;
  fileName: string | null;
  imageUrl: string;
  submittedAt: string;
  status: AdminCampaignReviewDecisionStatus;
  analysisStatus: string | null;
  analysisReason: string | null;
  similarity: number | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
}

export interface AdminCampaignReviewSubmissionsResult {
  campaign: { id: string; campaignName: string; businessName: string };
  data: AdminCampaignReviewSubmissionItem[];
  summary: { total: number; pending: number; passed: number; failed: number };
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export class AdminCampaignReviewSubmissionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function decisionStatus(status: string): AdminCampaignReviewDecisionStatus {
  if (status === "COMPLETED") return "PASSED";
  if (status === "REJECTED") return "FAILED";
  return "PENDING";
}

function maskPhone(phone: string | null) {
  return phone && phone.length >= 5 ? `${phone.slice(0, 3)}****${phone.slice(-2)}` : null;
}

function reviewerLabel(reviewer: { name: string | null; email: string | null; phone: string | null }) {
  return reviewer.name?.trim() || reviewer.email?.trim() || maskPhone(reviewer.phone) || "리뷰어";
}

const submittedProofWhere = {
  source: CAMPAIGN_ASSIGNMENT_SOURCE,
  reviewProofImageUrl: { not: null },
} as const;

export async function countAdminCampaignReviewSubmissions(campaignIds: string[]) {
  const counts = new Map<string, number>();
  if (!campaignIds.length) return counts;

  const rows = await prisma.receipt.groupBy({
    by: ["campaignId"],
    where: { ...submittedProofWhere, campaignId: { in: campaignIds } },
    _count: { _all: true },
  });
  for (const row of rows) counts.set(row.campaignId, row._count._all);
  return counts;
}

export async function listAdminCampaignReviewSubmissions(
  campaignId: string,
  pagination: { page: number; pageSize: number },
): Promise<AdminCampaignReviewSubmissionsResult> {
  const cleanCampaignId = campaignId.trim();
  if (!cleanCampaignId) {
    throw new AdminCampaignReviewSubmissionError(
      "INVALID_CAMPAIGN",
      "캠페인 정보를 확인해 주세요.",
    );
  }

  const page = Math.max(1, Math.floor(pagination.page));
  const pageSize = Math.min(50, Math.max(1, Math.floor(pagination.pageSize)));
  const campaign = await prisma.campaign.findUnique({
    where: { id: cleanCampaignId },
    select: { id: true, name: true, business: { select: { name: true } } },
  });
  if (!campaign) {
    throw new AdminCampaignReviewSubmissionError(
      "CAMPAIGN_NOT_FOUND",
      "캠페인을 찾을 수 없습니다.",
      404,
    );
  }

  const where = { ...submittedProofWhere, campaignId: cleanCampaignId };
  const [receipts, totalItems, groupedStatuses] = await Promise.all([
    prisma.receipt.findMany({
      where,
      orderBy: [{ reviewProofSubmittedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        reviewProofOriginalName: true,
        reviewProofSubmittedAt: true,
        reviewProofAnalysisStatus: true,
        reviewProofAnalysisReason: true,
        reviewProofSimilarity: true,
        reviewReviewedAt: true,
        reviewReviewedBy: true,
        reviewReviewNote: true,
        createdAt: true,
        reviewer: { select: { name: true, email: true, phone: true } },
      },
    }),
    prisma.receipt.count({ where }),
    prisma.receipt.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
  ]);

  const summary = { total: totalItems, pending: 0, passed: 0, failed: 0 };
  for (const row of groupedStatuses) {
    const count = row._count._all;
    const status = decisionStatus(row.status);
    if (status === "PASSED") summary.passed += count;
    else if (status === "FAILED") summary.failed += count;
    else summary.pending += count;
  }

  return {
    campaign: {
      id: campaign.id,
      campaignName: campaign.name,
      businessName: campaign.business.name,
    },
    data: receipts.map((receipt) => ({
      id: receipt.id,
      reviewerLabel: reviewerLabel(receipt.reviewer),
      fileName: receipt.reviewProofOriginalName,
      imageUrl: `/api/admin/review-proofs/${encodeURIComponent(receipt.id)}`,
      submittedAt: (receipt.reviewProofSubmittedAt ?? receipt.createdAt).toISOString(),
      status: decisionStatus(receipt.status),
      analysisStatus: receipt.reviewProofAnalysisStatus,
      analysisReason: receipt.reviewProofAnalysisReason,
      similarity: receipt.reviewProofSimilarity,
      reviewedAt: receipt.reviewReviewedAt?.toISOString() ?? null,
      reviewedBy: receipt.reviewReviewedBy,
      reviewNote: receipt.reviewReviewNote,
    })),
    summary,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: totalItems ? Math.ceil(totalItems / pageSize) : 0,
    },
  };
}
