import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getAdminSettlementRequests,
  settlementRequestsToCsv,
} from "@/lib/domain/admin";
import {
  decodeSettlementPayoutInfo,
  processSettlement,
  requestSettlement,
  upsertReviewerPayoutAccount,
} from "@/lib/domain/settlement";

let seq = 0;
const uniquePhone = () => `0109${String(seq++).padStart(7, "0")}`;

async function createReviewer(balance = 10000) {
  return prisma.reviewer.create({
    data: {
      phone: uniquePhone(),
      wallet: { create: { balance } },
    },
  });
}

describe("settlement payout account", () => {
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
  });
});
