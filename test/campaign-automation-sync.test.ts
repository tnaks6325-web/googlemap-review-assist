import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { syncGoogleMapReviewCampaignRows } from "@/lib/domain/google-sheet-campaign-sync";

describe("자동화용 시트 캠페인 반영", () => {
  it("자동화 모드는 새 캠페인을 비공개로 만들고 생성 캠페인 ID를 돌려준다", async () => {
    const suffix = Date.now();
    const result = await syncGoogleMapReviewCampaignRows(
      [{
        rowNumber: 6,
        status: "READY",
        advertiserName: `자동화 광고주 ${suffix}`,
        businessName: `자동화 반영 매장 ${suffix}`,
        searchKeyword: "자동화 반영",
        landingUrl: "https://maps.google.com/?cid=999",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        totalQuota: 25,
        dailyQuota: 5,
        guide: "자동화 가이드",
        guideKeywords: ["자동화키워드"],
        examplePhrases: [],
        examplePhraseCount: 0,
        excludedDays: [],
        errors: [],
        warnings: [],
        googlePlace: {
          status: "RESOLVED",
          providerConfigured: true,
          input: "자동화 반영",
          placeId: `ChIJ-auto-${suffix}`,
          name: `자동화 반영 매장 ${suffix}`,
          address: "서울 테스트로 1",
          url: "https://maps.google.com/?cid=999",
          rating: 4.8,
          reviewCount: 10,
          matchConfidence: 100,
          message: null,
        },
      }],
      { active: false, autoNaver: false },
    );

    expect(result).toMatchObject({ imported: 1, campaignIds: [expect.any(String)] });
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignIds[0] } });
    expect(campaign.active).toBe(false);
  });

  it("preserves each quota for distinct receipt IDs and updates only a repeated receipt", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const businessName = `quota history ${suffix}`;
    const placeId = `ChIJ-quota-${suffix}`;
    const row = (totalQuota: number, receiptId: string) => ({
      rowNumber: 6,
      status: "READY" as const,
      receiptId,
      advertiserName: `advertiser ${suffix}`,
      businessName,
      searchKeyword: businessName,
      landingUrl: "https://maps.google.com/?cid=1000",
      startDate: "2031-01-02",
      endDate: "2031-01-31",
      totalQuota,
      dailyQuota: 5,
      guide: "quota history guide",
      guideKeywords: [],
      examplePhrases: [],
      examplePhraseCount: 0,
      excludedDays: [],
      errors: [],
      warnings: [],
      googlePlace: {
        status: "RESOLVED" as const,
        providerConfigured: true,
        input: businessName,
        placeId,
        name: businessName,
        address: "Seoul test-ro 1",
        url: "https://maps.google.com/?cid=1000",
        rating: 4.8,
        reviewCount: 10,
        matchConfidence: 100,
        message: null,
      },
    });
    const options = {
      createNewCampaign: true,
      sourceTracking: { spreadsheetId: `sheet-${suffix}`, sheetName: "campaigns" },
    };

    const first = await syncGoogleMapReviewCampaignRows([row(25, `CMP-1-${suffix}`)], options);
    const second = await syncGoogleMapReviewCampaignRows([row(50, `CMP-2-${suffix}`)], options);
    const repeatedSecond = await syncGoogleMapReviewCampaignRows([row(55, `CMP-2-${suffix}`)], options);

    expect(first.imported).toBe(1);
    expect(second.imported).toBe(1);
    expect(repeatedSecond.updated).toBe(1);
    const campaigns = await prisma.campaign.findMany({
      where: { business: { googlePlaceId: placeId } },
      select: { totalQuota: true },
      orderBy: { totalQuota: "asc" },
    });
    expect(campaigns).toEqual([{ totalQuota: 25 }, { totalQuota: 55 }]);
  });

  it("keeps blank-receipt re-submissions separate by their sheet start date", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const businessName = `legacy quota history ${suffix}`;
    const placeId = `ChIJ-legacy-quota-${suffix}`;
    const row = (totalQuota: number, startDate: string, endDate: string) => ({
      rowNumber: 6,
      status: "READY" as const,
      advertiserName: `advertiser ${suffix}`,
      businessName,
      searchKeyword: businessName,
      landingUrl: "https://maps.google.com/?cid=1001",
      startDate,
      endDate,
      totalQuota,
      dailyQuota: 5,
      guide: "legacy quota history guide",
      guideKeywords: [],
      examplePhrases: [],
      examplePhraseCount: 0,
      excludedDays: [],
      errors: [],
      warnings: [],
      googlePlace: {
        status: "RESOLVED" as const,
        providerConfigured: true,
        input: businessName,
        placeId,
        name: businessName,
        address: "Seoul test-ro 1",
        url: "https://maps.google.com/?cid=1001",
        rating: 4.8,
        reviewCount: 10,
        matchConfidence: 100,
        message: null,
      },
    });
    const options = {
      createNewCampaign: true,
      sourceTracking: { spreadsheetId: `sheet-${suffix}`, sheetName: "campaigns" },
    };

    await syncGoogleMapReviewCampaignRows([row(25, "2031-01-02", "2031-01-31")], options);
    await syncGoogleMapReviewCampaignRows([row(50, "2031-02-02", "2031-02-28")], options);
    const repeatedFirst = await syncGoogleMapReviewCampaignRows([row(30, "2031-01-02", "2031-01-31")], options);

    expect(repeatedFirst.updated).toBe(1);
    const campaigns = await prisma.campaign.findMany({
      where: { business: { googlePlaceId: placeId } },
      select: { totalQuota: true },
      orderBy: { totalQuota: "asc" },
    });
    expect(campaigns).toEqual([{ totalQuota: 30 }, { totalQuota: 50 }]);
  });
});
