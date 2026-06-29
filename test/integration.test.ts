import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { requestSettlement, processSettlement } from "@/lib/domain/settlement";
import { getWalletSummary } from "@/lib/domain/points";
import { generateCodes, generateUniqueSlug } from "@/lib/domain/codes";

let seq = 0;
const uniq = () => `${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e6)}`;

async function reviewerWithBalance(balance: number) {
  const r = await prisma.reviewer.create({ data: { phone: `t${uniq()}` } });
  await prisma.pointWallet.create({ data: { reviewerId: r.id, balance } });
  if (balance !== 0) {
    await prisma.pointTransaction.create({
      data: { reviewerId: r.id, type: "ADJUST", amount: balance, idempotencyKey: `seed:${r.id}` },
    });
  }
  return r;
}

async function campaign() {
  const owner = await prisma.owner.create({ data: { email: `o${uniq()}@t.com`, password: "x" } });
  const biz = await prisma.business.create({ data: { ownerId: owner.id, name: `biz${uniq()}` } });
  const slug = await generateUniqueSlug();
  return prisma.campaign.create({ data: { businessId: biz.id, slug, name: "c" } });
}

describe("정산 원장 무결성 (R1/R3)", () => {
  it("최소 금액 미만 거부", async () => {
    const r = await reviewerWithBalance(10000);
    await expect(requestSettlement(r.id, 100, "BANK")).rejects.toMatchObject({ code: "MIN_AMOUNT" });
  });

  it("잔액 초과 거부", async () => {
    const r = await reviewerWithBalance(5000);
    await expect(requestSettlement(r.id, 6000, "BANK")).rejects.toMatchObject({ code: "INSUFFICIENT" });
  });

  it("성공 시 잔액 차감 + SETTLE 원장 기록", async () => {
    const r = await reviewerWithBalance(10000);
    const res = await requestSettlement(r.id, 6000, "BANK");
    expect(res.status).toBe("REQUESTED");
    expect(res.balance).toBe(4000);
    const settleTx = await prisma.pointTransaction.findFirst({
      where: { reviewerId: r.id, type: "SETTLE" },
    });
    expect(settleTx?.amount).toBe(-6000);
    const summary = await getWalletSummary(r.id);
    expect(summary.balance).toBe(4000); // 원장 합계 = 10000 - 6000
  });

  it("동시성 게이트: 잔여 초과 두번째 요청 거부(이중지출 차단)", async () => {
    const r = await reviewerWithBalance(10000);
    await requestSettlement(r.id, 6000, "BANK"); // 잔액 4000
    await expect(requestSettlement(r.id, 6000, "BANK")).rejects.toMatchObject({ code: "INSUFFICIENT" });
  });

  it("승인 → PAID + processedBy 기록", async () => {
    const r = await reviewerWithBalance(10000);
    const s = await requestSettlement(r.id, 6000, "BANK");
    const res = await processSettlement(s.settlementId, "approve", "admin:test");
    expect(res.status).toBe("PAID");
    const row = await prisma.settlement.findUnique({ where: { id: s.settlementId } });
    expect(row?.processedBy).toBe("admin:test");
  });

  it("반려 → 환불(잔액 복원)", async () => {
    const r = await reviewerWithBalance(10000);
    const s = await requestSettlement(r.id, 6000, "BANK"); // 잔액 4000
    const res = await processSettlement(s.settlementId, "reject", "admin:test");
    expect(res.status).toBe("REJECTED");
    const summary = await getWalletSummary(r.id);
    expect(summary.balance).toBe(10000); // 환불로 복원
  });

  it("이미 처리된 정산 재처리 거부", async () => {
    const r = await reviewerWithBalance(10000);
    const s = await requestSettlement(r.id, 6000, "BANK");
    await processSettlement(s.settlementId, "approve", "admin:test");
    await expect(processSettlement(s.settlementId, "reject", "admin:test")).rejects.toMatchObject({
      code: "BAD_STATE",
    });
  });
});

describe("잔액 권위화 (R2a)", () => {
  it("캐시가 원장과 다르면 원장 기준으로 보정", async () => {
    const r = await reviewerWithBalance(0);
    await prisma.pointTransaction.create({
      data: { reviewerId: r.id, type: "EARN", amount: 500, idempotencyKey: `e:${r.id}` },
    });
    // 캐시를 일부러 틀리게
    await prisma.pointWallet.update({ where: { reviewerId: r.id }, data: { balance: 999 } });
    const summary = await getWalletSummary(r.id);
    expect(summary.balance).toBe(500); // 원장 합계 권위
    const wallet = await prisma.pointWallet.findUnique({ where: { reviewerId: r.id } });
    expect(wallet?.balance).toBe(500); // 자가 보정됨
  });
});

describe("발급 코드 생성", () => {
  it("요청 수만큼 고유 코드 생성", async () => {
    const c = await campaign();
    const codes = await generateCodes(c.id, 5);
    expect(codes.length).toBe(5);
    expect(new Set(codes).size).toBe(5);
    const more = await generateCodes(c.id, 3);
    const total = await prisma.campaignCode.count({ where: { campaignId: c.id } });
    expect(total).toBe(8);
    expect(new Set([...codes, ...more]).size).toBe(8);
  });

  it("슬러그는 10자, 고유", async () => {
    const a = await generateUniqueSlug();
    const b = await generateUniqueSlug();
    expect(a.length).toBe(10);
    expect(a).not.toBe(b);
  });
});
