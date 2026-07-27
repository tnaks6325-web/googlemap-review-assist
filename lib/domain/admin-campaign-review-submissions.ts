import { prisma } from "@/lib/db";
import { decideReviewProofAnalysis } from "@/lib/domain/review-proof-analysis";
import { submitReviewerCampaignProof } from "@/lib/domain/reviewer-campaigns";

const CAMPAIGN_ASSIGNMENT_SOURCE = "CAMPAIGN_ASSIGNMENT";

export type AdminCampaignReviewDecisionStatus = "PENDING" | "PASSED" | "FAILED";
export type AdminCampaignReviewPlaceNameCheck = "PASS" | "FAIL" | "UNKNOWN";

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
  placeNameCheck: AdminCampaignReviewPlaceNameCheck;
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

export interface AdminCampaignReviewSubmissionSummary {
  total: number;
  passed: number;
}

function placeNameCheck(analysisJson: string | null): AdminCampaignReviewPlaceNameCheck {
  if (!analysisJson) return "UNKNOWN";
  try {
    const parsed = JSON.parse(analysisJson) as { checks?: { placeName?: unknown } };
    const value = parsed.checks?.placeName;
    return value === "PASS" || value === "FAIL" || value === "UNKNOWN" ? value : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

const submittedProofWhere = {
  source: CAMPAIGN_ASSIGNMENT_SOURCE,
  reviewProofImageUrl: { not: null },
} as const;

export async function countAdminCampaignReviewSubmissions(campaignIds: string[]) {
  const summaries = await summarizeAdminCampaignReviewSubmissions(campaignIds);
  const counts = new Map<string, number>();
  for (const [campaignId, summary] of summaries) counts.set(campaignId, summary.total);
  return counts;
}

export async function summarizeAdminCampaignReviewSubmissions(campaignIds: string[]) {
  const summaries = new Map<string, AdminCampaignReviewSubmissionSummary>();
  if (!campaignIds.length) return summaries;

  const rows = await prisma.receipt.groupBy({
    by: ["campaignId", "status"],
    where: { ...submittedProofWhere, campaignId: { in: campaignIds } },
    _count: { _all: true },
  });
  for (const row of rows) {
    const summary = summaries.get(row.campaignId) ?? { total: 0, passed: 0 };
    summary.total += row._count._all;
    if (row.status === "COMPLETED") summary.passed += row._count._all;
    summaries.set(row.campaignId, summary);
  }
  return summaries;
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
        reviewProofAnalysisJson: true,
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
      placeNameCheck: placeNameCheck(receipt.reviewProofAnalysisJson),
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

function storedExtractedText(receipt: {
  reviewProofExtractedText: string | null;
  reviewProofAnalysisJson: string | null;
}) {
  if (receipt.reviewProofExtractedText?.trim()) return receipt.reviewProofExtractedText;
  if (!receipt.reviewProofAnalysisJson) return "";
  try {
    const parsed = JSON.parse(receipt.reviewProofAnalysisJson) as { extractedText?: unknown };
    return typeof parsed.extractedText === "string" ? parsed.extractedText : "";
  } catch {
    return "";
  }
}

export async function reanalyzeAdminCampaignReviewSubmissions(campaignId: string) {
  const cleanCampaignId = campaignId.trim();
  if (!cleanCampaignId) {
    throw new AdminCampaignReviewSubmissionError(
      "INVALID_CAMPAIGN",
      "캠페인 정보를 확인해 주세요.",
    );
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: cleanCampaignId },
    select: { id: true, business: { select: { name: true } } },
  });
  if (!campaign) {
    throw new AdminCampaignReviewSubmissionError(
      "CAMPAIGN_NOT_FOUND",
      "캠페인을 찾을 수 없습니다.",
      404,
    );
  }

  const receipts = await prisma.receipt.findMany({
    where: {
      campaignId: cleanCampaignId,
      source: CAMPAIGN_ASSIGNMENT_SOURCE,
      status: "REVIEW_SUBMITTED",
      reviewProofAnalysisStatus: "MANUAL_REVIEW",
      reviewProofImageUrl: { not: null },
    },
    orderBy: { reviewProofSubmittedAt: "asc" },
    select: {
      id: true,
      reviewerId: true,
      createdAt: true,
      reviewDraftText: true,
      reviewProofImageUrl: true,
      reviewProofMimeType: true,
      reviewProofOriginalName: true,
      reviewProofSubmittedAt: true,
      reviewProofExtractedText: true,
      reviewProofAnalysisJson: true,
    },
  });

  const summary = { total: receipts.length, autoApproved: 0, stillPending: 0, skipped: 0 };
  for (const receipt of receipts) {
    const draftText = receipt.reviewDraftText?.trim() ?? "";
    const extractedText = storedExtractedText(receipt);
    if (
      draftText.length < 10 ||
      !extractedText.trim() ||
      !receipt.reviewProofImageUrl ||
      !receipt.reviewProofMimeType ||
      !receipt.reviewProofOriginalName
    ) {
      summary.skipped += 1;
      continue;
    }

    const analysis = decideReviewProofAnalysis({
      draftText,
      extractedText,
      expectedPlaceName: campaign.business.name,
      provider: "stored-ocr-reanalysis",
    });

    if (analysis.status !== "AUTO_APPROVE") {
      summary.stillPending += 1;
      if (analysis.status === "MANUAL_REVIEW") {
        await prisma.receipt.updateMany({
          where: {
            id: receipt.id,
            status: "REVIEW_SUBMITTED",
            reviewProofAnalysisStatus: "MANUAL_REVIEW",
          },
          data: {
            reviewProofSimilarity: analysis.similarity,
            reviewProofAnalysisReason: analysis.reason,
            reviewProofAnalysisProvider: analysis.provider,
            reviewProofAnalysisJson: JSON.stringify(analysis).slice(0, 4000),
          },
        });
      }
      continue;
    }

    await submitReviewerCampaignProof(receipt.reviewerId, receipt.id, {
      screenshotUrl: receipt.reviewProofImageUrl,
      screenshotMimeType: receipt.reviewProofMimeType,
      screenshotOriginalName: receipt.reviewProofOriginalName,
      draftText,
      analysis,
      reprocess: true,
      submittedAt: receipt.reviewProofSubmittedAt ?? receipt.createdAt,
    });
    summary.autoApproved += 1;
  }

  return summary;
}
