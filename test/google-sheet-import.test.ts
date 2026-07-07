import { describe, expect, it } from "vitest";
import {
  applyResolvedGooglePlaceNameToSheetRow,
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
      examplePhraseCount: 2,
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
