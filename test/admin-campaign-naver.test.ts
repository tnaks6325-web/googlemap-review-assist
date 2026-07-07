import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findBestNaverPlaceSnapshotForCampaign,
  naverCandidateSearchQueries,
  naverPlaceSnapshotFromCandidate,
  naverSearchTargetFromCampaign,
} from "@/lib/domain/admin-campaign-naver";

const originalNaverClientId = process.env.NAVER_CLIENT_ID;
const originalNaverClientSecret = process.env.NAVER_CLIENT_SECRET;

function responseJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("admin campaign naver candidate target", () => {
  beforeEach(() => {
    process.env.NAVER_CLIENT_ID = "test-naver-client-id";
    process.env.NAVER_CLIENT_SECRET = "test-naver-client-secret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalNaverClientId == null) delete process.env.NAVER_CLIENT_ID;
    else process.env.NAVER_CLIENT_ID = originalNaverClientId;
    if (originalNaverClientSecret == null) delete process.env.NAVER_CLIENT_SECRET;
    else process.env.NAVER_CLIENT_SECRET = originalNaverClientSecret;
  });

  it("prefers linked Google place snapshot over raw business fields", () => {
    const target = naverSearchTargetFromCampaign({
      business: {
        name: "원본 매장명",
        address: "원본 주소",
        externalPlaces: [
          {
            name: "구글 확정 매장",
            address: "서울 강남구 테헤란로",
            lat: 37.5,
            lng: 127.0,
          },
        ],
      },
    });

    expect(target).toEqual({
      base: {
        name: "구글 확정 매장",
        address: "서울 강남구 테헤란로",
        lat: 37.5,
        lng: 127.0,
      },
      query: "구글 확정 매장 서울 강남구 테헤란로",
    });
  });

  it("falls back to business fields when no Google place exists", () => {
    const target = naverSearchTargetFromCampaign({
      business: {
        name: "원본 매장명",
        address: "서울 중구",
        externalPlaces: [],
      },
    });

    expect(target).toEqual({
      base: {
        name: "원본 매장명",
        address: "서울 중구",
        lat: null,
        lng: null,
      },
      query: "원본 매장명 서울 중구",
    });
  });

  it("adds a name-only fallback query for automatic Naver search", () => {
    expect(
      naverCandidateSearchQueries({
        name: "Test Place",
        address: "Seoul Jung-gu long road address",
        lat: null,
        lng: null,
      })
    ).toEqual(["Test Place Seoul Jung-gu long road address", "Test Place"]);
  });

  it("uses only an explicit query when operator supplies one", () => {
    expect(
      naverCandidateSearchQueries(
        {
          name: "Test Place",
          address: "Seoul",
          lat: null,
          lng: null,
        },
        "manual search"
      )
    ).toEqual(["manual search"]);
  });

  it("converts a selected Naver candidate into a saveable external place snapshot", () => {
    const place = naverPlaceSnapshotFromCandidate(
      {
        title: "<b>Test Place</b>",
        link: "https://map.naver.com/p/entry/place/1234567890",
        category: "Food>Restaurant",
        roadAddress: "Seoul Jung-gu 1",
        matchConfidence: 83,
      },
      "Fallback Business"
    );

    expect(place).toMatchObject({
      platform: "NAVER",
      externalId: "1234567890",
      url: "https://map.naver.com/p/entry/place/1234567890",
      name: "Test Place",
      address: "Seoul Jung-gu 1",
      category: "Food>Restaurant",
      matchConfidence: 83,
    });
  });

  it("does not persist non-Naver candidate links as place URLs", () => {
    const place = naverPlaceSnapshotFromCandidate(
      {
        title: "Search Result Place",
        link: "https://example.com/place/123",
        matchConfidence: 70,
      },
      "Fallback Business"
    );

    expect(place).toMatchObject({
      platform: "NAVER",
      externalId: null,
      url: null,
      name: "Search Result Place",
      matchConfidence: 70,
    });
  });

  it("finds the best automatic Naver candidate for a campaign", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      expect(url).toContain("https://openapi.naver.com/v1/search/local.json");
      expect(new URL(url).searchParams.get("query")).toContain("Test Place");
      return responseJson({
        items: [
          {
            title: "Other Place",
            link: "https://map.naver.com/p/entry/place/999",
            category: "Restaurant",
            roadAddress: "Busan",
          },
          {
            title: "<b>Test Place</b>",
            link: "https://map.naver.com/p/entry/place/1234567890",
            category: "Restaurant",
            roadAddress: "Seoul Jung-gu 1",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await findBestNaverPlaceSnapshotForCampaign({
      business: {
        name: "Fallback Business",
        address: "Fallback Address",
        externalPlaces: [
          {
            name: "Test Place",
            address: "Seoul Jung-gu 1",
            lat: null,
            lng: null,
          },
        ],
      },
    });

    expect(result.providerConfigured).toBe(true);
    expect(result.candidateCount).toBe(2);
    expect(result.place).toMatchObject({
      platform: "NAVER",
      externalId: "1234567890",
      name: "Test Place",
      address: "Seoul Jung-gu 1",
    });
  });

  it("skips automatic Naver candidate selection when provider keys are missing", async () => {
    delete process.env.NAVER_CLIENT_ID;
    delete process.env.NAVER_CLIENT_SECRET;

    const result = await findBestNaverPlaceSnapshotForCampaign({
      business: {
        name: "Test Place",
        address: "Seoul Jung-gu 1",
        externalPlaces: [],
      },
    });

    expect(result).toMatchObject({
      place: null,
      providerConfigured: false,
      candidateCount: 0,
    });
  });
});
