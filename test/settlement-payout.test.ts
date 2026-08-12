import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getAdminAutoSettlementCandidates,
  getAdminSettlementRequests,
  settlementRequestsToCsv,
} from "@/lib/domain/admin";
import {
  createAdminSettlementForFullBalance,
  decodeSettlementPayoutInfo,
  getReviewerSettlementSummary,
  processSettlement,
  requestSettlement,
  upsertReviewerPayoutAccount,
} from "@/lib/domain/settlement";
import { runMoneyTx } from "@/lib/tx";

let seq = 0;
const uniquePhone = () => `0109${String(seq++).padStart(7, "0")}`;

async function createReviewer(balance = 10000) {
  return prisma.reviewer.create({
    data: {
      phone: uniquePhone(),
      name: "Test Reviewer",
      wallet: { create: { balance } },
    },
  });
}

describe("settlement payout account", () => {
  it("allows an administrator to register a reviewer's entire positive balance for a bank payout", async () => {
    const reviewer = await createReviewer(550);
    await upsertReviewerPayoutAccount(reviewer.id, {
      bankName: "하나은행",
      accountNumber: "110-123-456789",
      accountHolder: "관리자정산",
    });
    const settlement = await createAdminSettlementForFullBalance(reviewer.id, "admin:test");
    expect(settlement.amount).toBe(550);
    const summary = await getReviewerSettlementSummary(reviewer.id);
    expect(summary).toMatchObject({ availableBalance: 0, pendingAmount: 550 });
  });

  it("exposes only masked account data to the automatic Hana settlement candidate view", async () => {
    const reviewer = await createReviewer(12500);
    await upsertReviewerPayoutAccount(reviewer.id, {
      bankName: "하나은행",
      accountNumber: "110-123-456789",
      accountHolder: "관리자정산",
    });

    const candidate = (await getAdminAutoSettlementCandidates()).find((item) => item.reviewerId === reviewer.id);

    expect(candidate).toMatchObject({
      reviewerId: reviewer.id,
      amount: 12500,
      payout: { bankName: "하나은행", maskedAccountNumber: "****6789" },
      unavailableReason: null,
    });
    expect(JSON.stringify(candidate)).not.toContain("110123456789");
    expect(JSON.stringify(candidate)).not.toContain("관리자정산");
    expect(JSON.stringify(candidate)).not.toContain("Test Reviewer");
  });

  it("atomically reserves a requested settlement for one Hana export", async () => {
    const reviewer = await createReviewer(5000);
    await upsertReviewerPayoutAccount(reviewer.id, {
      bankName: "하나은행",
      accountNumber: "110-123-456789",
      accountHolder: "관리자정산",
    });
    const settlement = await createAdminSettlementForFullBalance(reviewer.id, "admin:test");

    const attempts = await Promise.all([
      runMoneyTx((tx) => tx.settlement.updateMany({
        where: { id: settlement.settlementId, status: "REQUESTED" },
        data: { status: "EXPORTED" },
      })),
      runMoneyTx((tx) => tx.settlement.updateMany({
        where: { id: settlement.settlementId, status: "REQUESTED" },
        data: { status: "EXPORTED" },
      })),
    ]);

    expect(attempts.map((attempt) => attempt.count).sort()).toEqual([0, 1]);
    await expect(prisma.settlement.findUniqueOrThrow({ where: { id: settlement.settlementId } }))
      .resolves.toMatchObject({ status: "EXPORTED" });
    await expect(getReviewerSettlementSummary(reviewer.id))
      .resolves.toMatchObject({ availableBalance: 0, pendingAmount: 5000 });
    await expect(createAdminSettlementForFullBalance(reviewer.id, "admin:test"))
      .rejects.toMatchObject({ code: "PENDING_EXISTS" });
  });

  it("returns the full normalized account number to the authenticated reviewer view", async () => {
    const reviewer = await createReviewer();
    const payoutAccount = await upsertReviewerPayoutAccount(reviewer.id, {
      bankName: "하나은행",
      accountNumber: "123-456789-01-234",
      accountHolder: "김리뷰",
    });

    expect(payoutAccount).toMatchObject({
      bankName: "하나은행",
      accountNumber: "12345678901234",
      accountLast4: "1234",
      accountHolder: "김리뷰",
    });
  });

  it("requires a saved payout account before requesting settlement", async () => {
    const reviewer = await createReviewer();

    await expect(requestSettlement(reviewer.id, 3000, "BANK")).rejects.toMatchObject({
      code: "PAYOUT_REQUIRED",
    });
  });

  it("enforces minimum amount and 1000 point unit", async () => {
    const reviewer = await createReviewer();
    await upsertReviewerPayoutAccount(reviewer.id, {
      bankName: "국민은행",
      accountNumber: "123-456789-01-2",
      accountHolder: "홍길동",
    });

    await expect(requestSettlement(reviewer.id, 2000, "BANK")).rejects.toMatchObject({
      code: "MIN_AMOUNT",
    });
    await expect(requestSettlement(reviewer.id, 3500, "BANK")).rejects.toMatchObject({
      code: "INVALID_AMOUNT_UNIT",
    });
  });

  it("snapshots the saved account and creates a paid notification", async () => {
    const reviewer = await createReviewer();
    await upsertReviewerPayoutAccount(reviewer.id, {
      bankName: "신한은행",
      accountNumber: "110-123-456789",
      accountHolder: "김리뷰",
    });

    const requested = await requestSettlement(reviewer.id, 4000, "BANK");
    const settlement = await prisma.settlement.findUniqueOrThrow({
      where: { id: requested.settlementId },
    });
    const payout = decodeSettlementPayoutInfo(settlement.payoutInfo);

    expect(payout).toMatchObject({
      bankName: "신한은행",
      accountNumber: "110123456789",
      accountLast4: "6789",
      accountHolder: "김리뷰",
    });
    expect(requested.balance).toBe(6000);

    const adminRows = await getAdminSettlementRequests("REQUESTED");
    const csv = settlementRequestsToCsv(adminRows.filter((row) => row.id === requested.settlementId));
    expect(csv).toContain("110123456789");

    await processSettlement(requested.settlementId, "approve", "admin:test");

    const notification = await prisma.reviewerNotification.findFirst({
      where: { reviewerId: reviewer.id, type: "SETTLEMENT_PAID" },
    });
    expect(notification?.title).toBe("정산완료");
    expect(notification?.body).toContain("4,000P");

    const summary = await getReviewerSettlementSummary(reviewer.id);
    expect(summary).toMatchObject({
      availableBalance: 6000,
      pendingAmount: 0,
      paidAmount: 4000,
    });
  });
});
