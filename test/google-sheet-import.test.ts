import { describe, expect, it } from "vitest";
import {
  applyResolvedGooglePlaceNameToSheetRow,
  excludeExistingGoogleMapReviewCampaignRows,
  googlePlaceInputForSheetRow,
  parseGoogleMapReviewSheet,
} from "@/lib/domain/google-sheet-import";

const header = [
  "",
  "writtenAt",
  "startDate",
  "endDate",
  "status",
  "advertiserName",
  "businessName",
  "searchKeyword",
  "type",
  "rank",
  "answer",
  "productType",
  "landingUrl",
  "totalQuota",
  "dailyQuota",
  "guide",
  "examples",
  "excludedDays",
  "period",
];

describe("google map review sheet import dry-run parser", () => {
  it("excludes rows whose campaigns were already reflected", () => {
    const existingCampaign = { businessName: "Warm Table" };
    const rows = [
      {
        rowNumber: 6,
        status: "READY" as const,
        advertiserName: "Advertiser A",
        businessName: "Warm Table",
        searchKeyword: "",
        landingUrl: "https://maps.app.goo.gl/warm-table",
        startDate: "2026-07-02",
        endDate: "2026-07-10",
        totalQuota: 30,
        dailyQuota: 5,
        guide: "Guide",
        guideKeywords: ["Guide"],
        examplePhrases: ["Example"],
        examplePhraseCount: 1,
        excludedDays: [],
        errors: [],
        warnings: [],
      },
      {
        rowNumber: 7,
        status: "READY" as const,
        advertiserName: "Advertiser B",
        businessName: "New Table",
        searchKeyword: "",
        landingUrl: "https://maps.app.goo.gl/new-table",
        startDate: "2026-07-02",
        endDate: "2026-07-10",
        totalQuota: 30,
        dailyQuota: 5,
        guide: "Guide",
        guideKeywords: ["Guide"],
        examplePhrases: ["Example"],
        examplePhraseCount: 1,
        excludedDays: [],
        errors: [],
        warnings: [],
      },
    ];

    const result = excludeExistingGoogleMapReviewCampaignRows(rows, [existingCampaign]);

    expect(result.skippedExistingCampaigns).toBe(1);
    expect(result.rows.map((row) => row.businessName)).toEqual(["New Table"]);

    const placeIdResult = excludeExistingGoogleMapReviewCampaignRows(
      [
        {
          ...rows[0],
          businessName: "Warm Table sheet alias",
          googlePlace: {
            status: "RESOLVED",
            providerConfigured: true,
            input: rows[0].landingUrl,
            placeId: "ChIJWarmTable",
            name: "Warm Table on Google",
            address: null,
            url: null,
            rating: null,
            reviewCount: null,
            matchConfidence: 100,
            message: null,
          },
        },
      ],
      [{ businessName: "Warm Table", googlePlaceIds: ["ChIJWarmTable"] }]
    );

    expect(placeIdResult.rows).toEqual([]);
  });

  it("marks complete campaign rows as ready", () => {
    const result = parseGoogleMapReviewSheet([
      [],
      [],
      [],
      [],
      header,
      [
        "",
        "2026-07-01",
        "2026-07-02",
        "2026-07-10",
        "9",
        "Advertiser A",
        "Warm Table",
        "Gangnam Korean food",
        "Google review",
        "3",
        "Warm Table",
        "Visit review",
        "https://maps.app.goo.gl/test",
        "30",
        "5",
        "Mention side dishes and kind service",
        "Kind service\nGood side dishes",
        "Fri",
        "9",
      ],
    ]);

    expect(result.summary).toMatchObject({
      totalRows: 1,
      readyRows: 1,
      errorRows: 0,
      warningRows: 0,
    });
    expect(result.rows[0]).toMatchObject({
      rowNumber: 6,
      status: "READY",
      advertiserName: "Advertiser A",
      businessName: "Warm Table",
      searchKeyword: "Gangnam Korean food",
      landingUrl: "https://maps.app.goo.gl/test",
      totalQuota: 30,
      dailyQuota: 5,
      startDate: "2026-07-02",
      endDate: "2026-07-10",
      guideKeywords: ["Mention side dishes and kind service"],
      examplePhrases: ["Kind service", "Good side dishes"],
      examplePhraseCount: 2,
    });
  });

  it("rejects invalid dates and an end date before the start date", () => {
    const invalidDate = parseGoogleMapReviewSheet([
      [],
      [],
      [],
      [],
      header,
      [
        "",
        "2026-07-01",
        "2026-02-30",
        "2026-03-01",
        "9",
        "Advertiser A",
        "Warm Table",
        "",
        "",
        "",
        "",
        "",
        "https://maps.app.goo.gl/test",
        "30",
        "5",
      ],
    ]);
    const reversed = parseGoogleMapReviewSheet([
      [],
      [],
      [],
      [],
      header,
      [
        "",
        "2026-07-01",
        "2026. 7. 25.",
        "2026. 7. 21.",
        "9",
        "Advertiser A",
        "Warm Table",
        "",
        "",
        "",
        "",
        "",
        "https://maps.app.goo.gl/test",
        "30",
        "5",
      ],
    ]);

    expect(invalidDate.rows[0]).toMatchObject({ status: "ERROR", startDate: "" });
    expect(invalidDate.rows[0].errors).toContain("광고 시작일 형식이 올바르지 않습니다");
    expect(reversed.rows[0]).toMatchObject({
      status: "ERROR",
      startDate: "2026-07-25",
      endDate: "2026-07-21",
    });
    expect(reversed.rows[0].errors).toContain("광고 종료일은 시작일보다 빠를 수 없습니다");
  });

  it("splits slash-separated review examples from the actual order sheet", () => {
    const result = parseGoogleMapReviewSheet([
      [],
      [],
      [],
      [],
      header,
      [
        "",
        "2026-07-17",
        "2026-07-21",
        "2026-07-25",
        "5",
        "finish46",
        "모락샤브 강남점",
        "미기재",
        "구글리뷰",
        "미기재",
        "미기재",
        "구글 리뷰형",
        "https://maps.app.goo.gl/test",
        "25",
        "5",
        "강남역 샤브샤브, 매장이 넓고 쾌적한, 친절한 서비스",
        "야채가 신선했어요 / 매장이 넓고 쾌적해요/직원분들이 친절해요",
      ],
    ]);

    expect(result.rows[0]).toMatchObject({
      guideKeywords: ["강남역 샤브샤브", "매장이 넓고 쾌적한", "친절한 서비스"],
      examplePhrases: ["야채가 신선했어요", "매장이 넓고 쾌적해요", "직원분들이 친절해요"],
      examplePhraseCount: 3,
    });
  });

  it("reports validation errors without throwing", () => {
    const result = parseGoogleMapReviewSheet([
      [],
      [],
      [],
      [],
      header,
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "2026-07-01", "", "", "", "", "Price", "", "", "", "", "", "", "2", "5"],
    ]);

    expect(result.summary).toMatchObject({
      totalRows: 1,
      readyRows: 0,
      errorRows: 1,
    });
    expect(result.rows[0].rowNumber).toBe(7);
    expect(result.rows[0].status).toBe("ERROR");
    expect(result.rows[0].errors.length).toBeGreaterThanOrEqual(5);
  });

  it("ignores formula-only helper rows without campaign input", () => {
    const result = parseGoogleMapReviewSheet([
      [],
      [],
      [],
      [],
      header,
      ["", "", "2026-07-01", "2026-07-10", "9", "", "", "", "", "", "", "", "", "", "", "", "", "Fri", "9"],
    ]);

    expect(result.summary.totalRows).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it("uses direct Google place URLs when they contain a place id", () => {
    const url = "https://www.google.com/maps/search/?api=1&query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4";

    expect(
      googlePlaceInputForSheetRow({
        businessName: "Warm Table",
        searchKeyword: "Gangnam Korean food",
        landingUrl: url,
      })
    ).toBe(url);
  });

  it("uses Google short/share landing URLs directly so the resolver can expand them", () => {
    const shortUrl = "https://maps.app.goo.gl/abc123";
    const shareUrl = "https://share.google/iNjppG3Gmoa3Yxwa4";

    expect(
      googlePlaceInputForSheetRow({
        businessName: "Warm Table",
        searchKeyword: "Gangnam Korean food",
        landingUrl: shortUrl,
      })
    ).toBe(shortUrl);

    expect(
      googlePlaceInputForSheetRow({
        businessName: "Warm Table",
        searchKeyword: "Gangnam Korean food",
        landingUrl: shareUrl,
      })
    ).toBe(shareUrl);
  });

  it("allows blank business names when a Google place URL can provide the name", () => {
    const result = parseGoogleMapReviewSheet([
      [],
      [],
      [],
      [],
      header,
      [
        "",
        "2026-07-01",
        "2026-07-02",
        "2026-07-10",
        "9",
        "Advertiser A",
        "",
        "",
        "Google review",
        "3",
        "",
        "Visit review",
        "https://maps.app.goo.gl/test",
        "30",
        "5",
        "Mention side dishes and kind service",
        "Kind service",
        "",
        "9",
      ],
    ]);

    expect(result.rows[0]).toMatchObject({
      status: "READY",
      businessName: "",
      landingUrl: "https://maps.app.goo.gl/test",
    });

    const row = applyResolvedGooglePlaceNameToSheetRow(
      result.rows[0],
      {
        platform: "GOOGLE",
        externalId: "ChIJresolved",
        url: "https://maps.google.com/?cid=1",
        name: "Resolved Place",
        address: "Seoul",
        phone: null,
        category: null,
        lat: null,
        lng: null,
        rating: 4.8,
        reviewCount: 12,
        receiptReviewCount: null,
        matchConfidence: 100,
        rawJson: null,
      },
      true
    );

    expect(row.businessName).toBe("Resolved Place");
  });

  it("does not overwrite a sheet-provided business name with the Google place name", () => {
    const row = applyResolvedGooglePlaceNameToSheetRow(
      {
        rowNumber: 6,
        status: "READY",
        advertiserName: "Advertiser A",
        businessName: "Sheet Name",
        searchKeyword: "",
        landingUrl: "https://maps.app.goo.gl/test",
        startDate: "2026-07-02",
        endDate: "2026-07-10",
        totalQuota: 30,
        dailyQuota: 5,
        guide: "Guide",
        guideKeywords: ["Guide"],
        examplePhrases: ["Example"],
        examplePhraseCount: 1,
        excludedDays: [],
        errors: [],
        warnings: [],
      },
      {
        platform: "GOOGLE",
        externalId: "ChIJresolved",
        url: "https://maps.google.com/?cid=1",
        name: "Resolved Place",
        address: "Seoul",
        phone: null,
        category: null,
        lat: null,
        lng: null,
        rating: 4.8,
        reviewCount: 12,
        receiptReviewCount: null,
        matchConfidence: 100,
        rawJson: null,
      },
      true
    );

    expect(row.businessName).toBe("Sheet Name");
  });
});
