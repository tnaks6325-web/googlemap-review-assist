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
});
