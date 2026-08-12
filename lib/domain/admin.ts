import { prisma } from "@/lib/db";
import { decodeSettlementPayoutInfo } from "@/lib/domain/settlement";

const maskPhone = (phone?: string | null) =>
  phone && phone.length >= 5 ? `${phone.slice(0, 3)}****${phone.slice(-2)}` : "-";

const maskAccount = (accountNumber?: string | null, last4?: string | null) => {
  if (accountNumber) {
    return `${"*".repeat(Math.max(accountNumber.length - 4, 0))}${accountNumber.slice(-4)}`;
  }
  return last4 ? `****${last4}` : "-";
};

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function formatExportDate(date: Date) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export type AdminReviewProofCheckStatus = "PASS" | "FAIL" | "UNKNOWN";

export interface AdminReviewProofChecks {
  placeName: AdminReviewProofCheckStatus;
  rating: AdminReviewProofCheckStatus;
  recency: AdminReviewProofCheckStatus;
}

export type AdminReviewProofFilter = "ALL" | "MANUAL_REVIEW" | "OCR_UNAVAILABLE";

type ReviewProofFilterItem = {
  analysisStatus: string | null;
  extractedText: string | null;
};

export function filterAdminReviewProofs<T extends ReviewProofFilterItem>(
  items: T[],
  filter: AdminReviewProofFilter,
): T[] {
  if (filter === "MANUAL_REVIEW") {
    return items.filter((item) => item.analysisStatus !== "AUTO_APPROVE");
  }
  if (filter === "OCR_UNAVAILABLE") {
    return items.filter(
      (item) => item.analysisStatus === "UNAVAILABLE" || !item.extractedText?.trim(),
    );
  }
  return items;
}

const isReviewProofCheckStatus = (value: unknown): value is AdminReviewProofCheckStatus =>
  value === "PASS" || value === "FAIL" || value === "UNKNOWN";

const normalizeReviewProofCheckStatus = (value: unknown): AdminReviewProofCheckStatus =>
  isReviewProofCheckStatus(value) ? value : "UNKNOWN";

export function parseReviewProofAnalysisChecks(rawJson?: string | null): AdminReviewProofChecks | null {
  if (!rawJson) return null;

  try {
    const parsed = JSON.parse(rawJson) as { checks?: Record<string, unknown> };
    if (!parsed || typeof parsed !== "object" || !parsed.checks || typeof parsed.checks !== "object") {
      return null;
    }

    return {
      placeName: normalizeReviewProofCheckStatus(parsed.checks.placeName),
      rating: normalizeReviewProofCheckStatus(parsed.checks.rating),
      recency: normalizeReviewProofCheckStatus(parsed.checks.recency),
    };
  } catch {
    return null;
  }
}

export interface AdminReviewerRow {
  id: string;
  phone: string | null;
  maskedPhone: string;
  displayName: string;
  balance: number;
  pendingAmount: number;
  paidAmount: number;
  settlementCount: number;
  receiptCount: number;
  payoutAccount: {
    bankName: string;
    maskedAccountNumber: string;
    accountHolder: string;
  } | null;
  createdAt: Date;
}

export interface AdminSettlementRequestRow {
  id: string;
  reviewerId: string;
  phone: string | null;
  maskedPhone: string;
  amount: number;
  method: string;
  status: string;
  createdAt: Date;
  payout: {
    bankName: string;
    accountNumber: string;
    maskedAccountNumber: string;
    accountHolder: string;
  } | null;
}

export interface AdminReviewProofRow {
  id: string;
  reviewerId: string;
  reviewerName: string | null;
  maskedPhone: string;
  businessName: string;
  campaignName: string;
  status: string;
  rewardPoints: number;
  draftText: string | null;
  hasProofImage: boolean;
  proofOriginalName: string | null;
  extractedText: string | null;
  analysisStatus: string | null;
  analysisReason: string | null;
  analysisProvider: string | null;
  similarity: number | null;
  analysisChecks: AdminReviewProofChecks | null;
  submittedAt: Date;
  createdAt: Date;
}

export async function getPendingSettlements() {
  const items = await prisma.settlement.findMany({
    where: { status: "REQUESTED" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { reviewer: { select: { phone: true } } },
  });
  return items.map((settlement) => ({
    id: settlement.id,
    amount: settlement.amount,
    method: settlement.method,
    phone: maskPhone(settlement.reviewer.phone),
    createdAt: settlement.createdAt,
  }));
}

export async function getPendingReviewProofs(): Promise<AdminReviewProofRow[]> {
  const receipts = await prisma.receipt.findMany({
    where: { source: "CAMPAIGN_ASSIGNMENT", status: "REVIEW_SUBMITTED" },
    orderBy: [{ reviewProofSubmittedAt: "asc" }, { createdAt: "asc" }],
    take: 100,
    include: {
      reviewer: { select: { name: true, phone: true } },
      business: { select: { name: true } },
      campaign: { select: { name: true, rewardPoints: true } },
    },
  });

  return receipts.map((receipt) => ({
    id: receipt.id,
    reviewerId: receipt.reviewerId,
    reviewerName: receipt.reviewer.name,
    maskedPhone: maskPhone(receipt.reviewer.phone),
    businessName: receipt.business.name,
    campaignName: receipt.campaign.name,
    status: receipt.status,
    rewardPoints: receipt.rewardPoints ?? receipt.campaign.rewardPoints,
    draftText: receipt.reviewDraftText,
    hasProofImage: Boolean(receipt.reviewProofImageUrl),
    proofOriginalName: receipt.reviewProofOriginalName,
    extractedText: receipt.reviewProofExtractedText,
    analysisStatus: receipt.reviewProofAnalysisStatus,
    analysisReason: receipt.reviewProofAnalysisReason,
    analysisProvider: receipt.reviewProofAnalysisProvider,
    similarity: receipt.reviewProofSimilarity,
    analysisChecks: parseReviewProofAnalysisChecks(receipt.reviewProofAnalysisJson),
    submittedAt: receipt.reviewProofSubmittedAt ?? receipt.createdAt,
    createdAt: receipt.createdAt,
  }));
}

export async function getAdminReviewerRows(): Promise<AdminReviewerRow[]> {
  const reviewers = await prisma.reviewer.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      wallet: { select: { balance: true } },
      payoutAccount: {
        select: {
          bankName: true,
          accountLast4: true,
          accountHolder: true,
        },
      },
      _count: { select: { receipts: true, settlements: true } },
    },
  });
  const reviewerIds = reviewers.map((reviewer) => reviewer.id);
  const groupedSettlements = reviewerIds.length
    ? await prisma.settlement.groupBy({
        by: ["reviewerId", "status"],
        where: { reviewerId: { in: reviewerIds } },
        _sum: { amount: true },
      })
    : [];

  const sums = new Map<string, { pending: number; paid: number }>();
  for (const row of groupedSettlements) {
    const current = sums.get(row.reviewerId) ?? { pending: 0, paid: 0 };
    if (row.status === "REQUESTED") current.pending += row._sum.amount ?? 0;
    if (row.status === "PAID") current.paid += row._sum.amount ?? 0;
    sums.set(row.reviewerId, current);
  }

  return reviewers.map((reviewer) => {
    const settlementSum = sums.get(reviewer.id) ?? { pending: 0, paid: 0 };
    return {
      id: reviewer.id,
      phone: reviewer.phone,
      maskedPhone: maskPhone(reviewer.phone),
      displayName: reviewer.name?.trim() || reviewer.email?.trim() || maskPhone(reviewer.phone),
      balance: reviewer.wallet?.balance ?? 0,
      pendingAmount: settlementSum.pending,
      paidAmount: settlementSum.paid,
      settlementCount: reviewer._count.settlements,
      receiptCount: reviewer._count.receipts,
      payoutAccount: reviewer.payoutAccount
        ? {
            bankName: reviewer.payoutAccount.bankName,
            maskedAccountNumber: maskAccount(null, reviewer.payoutAccount.accountLast4),
            accountHolder: reviewer.payoutAccount.accountHolder,
          }
        : null,
      createdAt: reviewer.createdAt,
    };
  });
}

export async function getAdminSettlementRequests(
  status = "REQUESTED",
): Promise<AdminSettlementRequestRow[]> {
  const settlements = await prisma.settlement.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: { reviewer: { select: { phone: true } } },
  });

  return settlements.map((settlement) => {
    const payout = decodeSettlementPayoutInfo(settlement.payoutInfo);
    return {
      id: settlement.id,
      reviewerId: settlement.reviewerId,
      phone: settlement.reviewer.phone,
      maskedPhone: maskPhone(settlement.reviewer.phone),
      amount: settlement.amount,
      method: settlement.method,
      status: settlement.status,
      createdAt: settlement.createdAt,
      payout: payout
        ? {
            ...payout,
            maskedAccountNumber: maskAccount(payout.accountNumber, payout.accountLast4),
          }
        : null,
    };
  });
}

export function settlementRequestsToCsv(rows: AdminSettlementRequestRow[]) {
  const header = [
    "정산ID",
    "휴대폰",
    "은행",
    "계좌번호",
    "예금주",
    "금액",
    "신청일",
  ];
  const lines = rows.map((row) =>
    [
      row.id,
      row.phone ?? "",
      row.payout?.bankName ?? "",
      row.payout?.accountNumber ?? "",
      row.payout?.accountHolder ?? "",
      row.amount,
      formatExportDate(row.createdAt),
    ]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${header.map(csvCell).join(",")}\r\n${lines.join("\r\n")}`;
}

export async function getAbuseSignals() {
  const grouped = await prisma.receipt.groupBy({
    by: ["reviewerId", "businessId"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });
  const reviewerIds = [...new Set(grouped.map((group) => group.reviewerId))];
  const businessIds = [...new Set(grouped.map((group) => group.businessId))];
  const [reviewers, businesses] = await Promise.all([
    prisma.reviewer.findMany({
      where: { id: { in: reviewerIds } },
      select: { id: true, phone: true },
    }),
    prisma.business.findMany({
      where: { id: { in: businessIds } },
      select: { id: true, name: true },
    }),
  ]);
  const reviewerMap = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.phone]));
  const businessMap = new Map(businesses.map((business) => [business.id, business.name]));
  const concentration = grouped.map((group) => ({
    phone: maskPhone(reviewerMap.get(group.reviewerId)),
    business: businessMap.get(group.businessId) ?? "-",
    count: group._count.id,
  }));

  const earners = await prisma.pointTransaction.groupBy({
    by: ["reviewerId"],
    where: { type: "EARN" },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 10,
  });
  const earnerMap = new Map(
    (
      await prisma.reviewer.findMany({
        where: { id: { in: earners.map((earner) => earner.reviewerId) } },
        select: { id: true, phone: true },
      })
    ).map((reviewer) => [reviewer.id, reviewer.phone]),
  );
  const topEarners = earners.map((earner) => ({
    phone: maskPhone(earnerMap.get(earner.reviewerId)),
    total: earner._sum.amount ?? 0,
  }));

  return { concentration, topEarners };
}
