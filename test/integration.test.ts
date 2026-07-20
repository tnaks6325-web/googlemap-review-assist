import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { requestSettlement, processSettlement, upsertReviewerPayoutAccount } from "@/lib/domain/settlement";
import { getWalletSummary } from "@/lib/domain/points";
import { generateCodes, generateUniqueSlug } from "@/lib/domain/codes";
import { saveExternalPlace } from "@/lib/domain/external-place-save";
import { externalReviewHash } from "@/lib/domain/external-places";
import { getPlaceIntelligence } from "@/lib/domain/place-intelligence";
import { syncGoogleMapReviewCampaignRows } from "@/lib/domain/google-sheet-campaign-sync";
import { getPublicCampaignDetail, listAdminCampaigns, listPublicCampaigns } from "@/lib/domain/operator-campaigns";

let seq = 0;
const uniq = () => `${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e6)}`;

async function reviewerWithBalance(balance: number) {
  const r = await prisma.reviewer.create({
    data: { phone: `t${uniq()}`, name: "Test Reviewer" },
  });
  await prisma.pointWallet.create({ data: { reviewerId: r.id, balance } });
  await upsertReviewerPayoutAccount(r.id, {
    bankName: "국민은행",
    accountNumber: "123-456789-01-2",
    accountHolder: "테스트",
  });
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

describe("개발용 OTP 우회", () => {
  it("비운영 환경에서는 000000 코드로 reviewer 세션을 만들 수 있다", async () => {
    const { POST: requestOtp } = await import("@/app/api/auth/otp/request/route");
    const { POST: verifyOtp } = await import("@/app/api/auth/otp/verify/route");
    const phone = `010${String(seq++).padStart(4, "0")}${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;

    const requestRes = await requestOtp(
      new Request("http://localhost/api/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      })
    );
    const requestData = await requestRes.json();

    expect(requestRes.status).toBe(200);
    expect(requestData.devCode).toBe("000000");

    const verifyRes = await verifyOtp(
      new Request("http://localhost/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: requestData.requestId, code: "000000" }),
      })
    );
    const verifyData = await verifyRes.json();

    expect(verifyRes.status).toBe(200);
    expect(verifyData.reviewerId).toBeTruthy();
  });

  it("비운영 환경에서는 요청 ID가 없어도 000000 코드와 전화번호로 통과할 수 있다", async () => {
    const { POST: verifyOtp } = await import("@/app/api/auth/otp/verify/route");
    const phone = `010${String(seq++).padStart(4, "0")}${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;

    const verifyRes = await verifyOtp(
      new Request("http://localhost/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "000000", phone }),
      })
    );
    const verifyData = await verifyRes.json();

    expect(verifyRes.status).toBe(200);
    expect(verifyData.reviewerId).toBeTruthy();
  });
});

describe("개발용 영수증 없음 우회", () => {
  it("비운영 환경에서는 영수증 없이 검증된 receipt를 생성한다", async () => {
    const reviewer = await prisma.reviewer.create({
      data: { phone: `0109${String(seq++).padStart(7, "0")}`, wallet: { create: {} } },
    });
    const owner = await prisma.owner.create({ data: { email: `receiptless${uniq()}@t.com`, password: "x" } });
    const biz = await prisma.business.create({ data: { ownerId: owner.id, name: "영수증없음 테스트 매장" } });
    const c = await prisma.campaign.create({
      data: { businessId: biz.id, slug: await generateUniqueSlug(), name: "영수증 없음 캠페인", active: true },
    });

    const { createDevNoReceipt } = await import("@/lib/domain/dev-receipts");
    const receipt = await createDevNoReceipt(c.id, reviewer.id);

    expect(receipt).toMatchObject({ source: "DEV_NO_RECEIPT", status: "VERIFIED" });
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

describe("운영자형 캠페인 목록", () => {
  it("공개 목록은 active 캠페인만 노출하고 Google Place URL을 우선 사용", async () => {
    const owner = await prisma.owner.create({ data: { email: `camp${uniq()}@t.com`, password: "x" } });
    const biz = await prisma.business.create({
      data: { ownerId: owner.id, name: "하리무드범계본점", address: "경기 안양시" },
    });
    await saveExternalPlace(biz.id, {
      platform: "GOOGLE",
      externalId: "ChIJcampaign123",
      url: "https://maps.app.goo.gl/testCampaign",
      name: "하리무드 범계본점",
      address: "경기 안양시 동안구",
      phone: null,
      category: "미용실",
      lat: null,
      lng: null,
      rating: 4.9,
      reviewCount: 141,
      receiptReviewCount: null,
      matchConfidence: 100,
      rawJson: null,
    });
    const active = await prisma.campaign.create({
      data: { businessId: biz.id, slug: await generateUniqueSlug(), name: "구글맵 방문 캠페인", active: true },
    });
    const inactive = await prisma.campaign.create({
      data: { businessId: biz.id, slug: await generateUniqueSlug(), name: "중지 캠페인", active: false },
    });

    const publicItems = await listPublicCampaigns();
    const activeRow = publicItems.find((c) => c.id === active.id);

    expect(activeRow).toMatchObject({
      businessName: "하리무드 범계본점",
      category: "미용실",
      googleMapsUrl: "https://maps.app.goo.gl/testCampaign",
      rewardPoints: 5000,
      statusLabel: "진행 중",
    });
    expect(publicItems.some((c) => c.id === inactive.id)).toBe(false);

    const detail = await getPublicCampaignDetail(active.slug);
    expect(detail?.googleMapsUrl).toBe("https://maps.app.goo.gl/testCampaign");
    expect(detail?.businessName).toBe("하리무드 범계본점");
  });

  it("시트 반영은 Google Place 스냅샷을 매장과 캠페인에 연결한다", async () => {
    const result = await syncGoogleMapReviewCampaignRows([
      {
        rowNumber: 6,
        status: "READY",
        advertiserName: "시트광고주",
        businessName: "시트연결식당",
        searchKeyword: "강남 한식",
        landingUrl: "https://maps.app.goo.gl/sheetTest",
        startDate: "2026-07-01",
        endDate: "2026-07-15",
        totalQuota: 3,
        dailyQuota: 1,
        guide: "실제 방문 경험만 참고",
        examplePhraseCount: 1,
        excludedDays: [],
        errors: [],
        warnings: [],
        googlePlace: {
          status: "RESOLVED",
          providerConfigured: true,
          input: "시트연결식당 강남 한식",
          placeId: "ChIJsheetCampaign123",
          name: "시트연결식당 구글",
          address: "서울 강남구 테스트로",
          url: "https://maps.google.com/?cid=12345",
          rating: 4.7,
          reviewCount: 33,
          matchConfidence: 100,
          message: null,
        },
      },
    ]);

    expect(result).toMatchObject({ imported: 1, updated: 0, skipped: 0 });

    const place = await prisma.externalPlace.findFirst({
      where: { platform: "GOOGLE", externalId: "ChIJsheetCampaign123" },
      include: { business: { include: { campaigns: true } } },
    });
    expect(place).toMatchObject({
      name: "시트연결식당 구글",
      url: "https://maps.google.com/?cid=12345",
      rating: 4.7,
      reviewCount: 33,
    });
    expect(place?.business.googlePlaceId).toBe("ChIJsheetCampaign123");
    expect(place?.business.campaigns).toHaveLength(1);

    const detail = await getPublicCampaignDetail(place!.business.campaigns[0].slug);
    expect(detail?.googleMapsUrl).toBe("https://maps.google.com/?cid=12345");
    expect(await prisma.campaignCode.count({ where: { campaignId: place!.business.campaigns[0].id } })).toBe(3);
  });

  it("관리자 목록은 비활성 캠페인과 운영 지표를 함께 반환", async () => {
    const owner = await prisma.owner.create({ data: { email: `admincamp${uniq()}@t.com`, password: "x" } });
    const biz = await prisma.business.create({
      data: {
        ownerId: owner.id,
        name: "블리비의원 건대점",
        menus: { create: [{ name: "상담", category: "방문" }] },
      },
    });
    const campaign = await prisma.campaign.create({
      data: { businessId: biz.id, slug: await generateUniqueSlug(), name: "시트 수입 캠페인", active: false },
    });
    await prisma.campaignCode.createMany({
      data: [
        { campaignId: campaign.id, code: `A${uniq()}` },
        { campaignId: campaign.id, code: `B${uniq()}` },
      ],
    });
    const reviewer = await prisma.reviewer.create({
      data: { phone: `0107${String(seq++).padStart(7, "0")}`, wallet: { create: { balance: 5000 } } },
    });
    const assignedReceipt = await prisma.receipt.create({
      data: {
        businessId: biz.id,
        campaignId: campaign.id,
        reviewerId: reviewer.id,
        code: `ASSIGN-${uniq()}`,
        source: "CAMPAIGN_ASSIGNMENT",
        dedupeHash: `assign:${uniq()}`,
        status: "ASSIGNED",
      },
    });
    const completedReceipt = await prisma.receipt.create({
      data: {
        businessId: biz.id,
        campaignId: campaign.id,
        reviewerId: reviewer.id,
        code: `COMPLETE-${uniq()}`,
        source: "CAMPAIGN_ASSIGNMENT",
        dedupeHash: `complete:${uniq()}`,
        status: "COMPLETED",
      },
    });
    await prisma.pointTransaction.create({
      data: {
        reviewerId: reviewer.id,
        type: "EARN",
        amount: 5000,
        idempotencyKey: `campaign-complete:${completedReceipt.id}`,
      },
    });

    const adminItems = await listAdminCampaigns();
    const row = adminItems.find((c) => c.id === campaign.id);

    expect(row).toMatchObject({
      active: false,
      businessName: "블리비의원 건대점",
      assignedCount: 2,
      completedCount: 1,
      paidPointAmount: 5000,
      menuCount: 1,
      issuedCodeCount: 2,
      statusLabel: "중지됨",
    });
    expect(row?.assignedCount).toBeGreaterThan(row?.completedCount ?? 0);
    expect(assignedReceipt.status).toBe("ASSIGNED");
  });
});

describe("외부 플레이스/리뷰 인사이트", () => {
  it("구글/네이버 플레이스 스냅샷과 외부 리뷰를 내부 피드백과 분리해 집계", async () => {
    const owner = await prisma.owner.create({ data: { email: `place${uniq()}@t.com`, password: "x" } });
    const biz = await prisma.business.create({ data: { ownerId: owner.id, name: "온기담은식당", address: "서울 강남구" } });

    await saveExternalPlace(biz.id, {
      platform: "GOOGLE",
      externalId: "ChIJtest123",
      url: "https://www.google.com/maps/search/?api=1&query_place_id=ChIJtest123",
      name: "온기담은식당",
      address: "서울 강남구",
      phone: null,
      category: "한식",
      lat: null,
      lng: null,
      rating: 4.5,
      reviewCount: 128,
      receiptReviewCount: null,
      matchConfidence: 100,
      rawJson: null,
    });
    const naver = await saveExternalPlace(biz.id, {
      platform: "NAVER",
      externalId: "123456789",
      url: "https://map.naver.com/p/entry/place/123456789",
      name: "온기담은식당",
      address: "서울 강남구",
      phone: null,
      category: "음식점>한식",
      lat: null,
      lng: null,
      rating: null,
      reviewCount: null,
      receiptReviewCount: 1,
      matchConfidence: 92,
      rawJson: null,
    });

    const reviewHash = externalReviewHash({
      businessId: biz.id,
      platform: "NAVER",
      externalReviewId: "r1",
      content: "친절하고 양이 많아요",
      publishedAt: new Date("2026-06-30T00:00:00.000Z"),
    });
    await prisma.externalReview.create({
      data: {
        businessId: biz.id,
        externalPlaceId: naver.id,
        platform: "NAVER",
        reviewType: "RECEIPT",
        rating: 5,
        content: "친절하고 양이 많아요",
        authorMasked: "ki***",
        publishedAt: new Date("2026-06-30T00:00:00.000Z"),
        externalReviewId: "r1",
        reviewHash,
      },
    });

    const intel = await getPlaceIntelligence(biz.id);
    expect(intel.internal.count).toBe(0);
    expect(intel.places.google?.reviewCount).toBe(128);
    expect(intel.places.naver?.matchConfidence).toBe(92);
    expect(intel.external.byPlatform.NAVER).toBe(1);
    expect(intel.external.byType.RECEIPT).toBe(1);
    expect(intel.external.keywords.map((k) => k.word)).toContain("친절하고");
  });
});
