import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findBestNaverPlaceSnapshotForCampaign,
  naverCandidateSearchQueries,
  naverPlaceSnapshotFromCandidate,
  naverPlaceSnapshotFromPlaceId,
  naverSearchTargetFromCampaign,
} from "@/lib/domain/admin-campaign-naver";
import { findNaverCandidates } from "@/lib/domain/external-place-providers";
import { scorePlaceCandidate } from "@/lib/domain/external-places";

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

  it("scores identical full addresses as a 100 percent place match", () => {
    const score = scorePlaceCandidate(
      {
        name: "하리무드범계본점",
        address: "대한민국 경기도 안양시 동안구 호계동 1044-7 화성프라자 5층",
        lat: null,
        lng: null,
      },
      {
        name: "하리무드 범계본점",
        address: "경기 안양시 동안구 호계동 1044-7 화성프라자 5층",
      }
    );

    expect(score).toBe(100);
  });

  it("scores addresses with an omitted neighborhood as 100 percent when detail matches", () => {
    const score = scorePlaceCandidate(
      {
        name: "블리비의원 건대점",
        address: "대한민국 서울특별시 광진구 화양동 아차산로 237 삼진빌딩 2층",
        lat: null,
        lng: null,
      },
      {
        name: "블리비의원 건대점",
        address: "서울특별시 광진구 아차산로 237 삼진빌딩 2층",
      }
    );

    expect(score).toBe(100);
  });

  it("scores same core address without detail as a practical 90 percent match", () => {
    const score = scorePlaceCandidate(
      {
        name: "로우파이브안국",
        address: "대한민국 서울특별시 종로구 북촌로 20-3 1층",
        lat: null,
        lng: null,
      },
      {
        name: "로우파이브 안국",
        address: "서울 종로구 북촌로 20-3",
      }
    );

    expect(score).toBeGreaterThanOrEqual(90);
    expect(score).toBeLessThan(100);
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

  it("canonicalizes Naver search-result URLs before saving candidate snapshots", () => {
    const place = naverPlaceSnapshotFromCandidate(
      {
        title: "<b>Grains Cookies Bukchon</b>",
        link: "https://map.naver.com/p/search/grains/place/1234567890",
        category: "Bakery",
        roadAddress: "Seoul Jongno-gu 1",
        matchConfidence: 95,
      },
      "Fallback Business"
    );

    expect(place).toMatchObject({
      platform: "NAVER",
      externalId: "1234567890",
      url: "https://map.naver.com/p/entry/place/1234567890",
      name: "Grains Cookies Bukchon",
      matchConfidence: 95,
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

  it("does not persist Naver blog links as SmartPlace URLs", () => {
    const place = naverPlaceSnapshotFromCandidate(
      {
        title: "Harimood Beomgye",
        link: "https://blog.naver.com/some-blog-post",
        matchConfidence: 100,
      },
      "Fallback Business"
    );

    expect(place).toMatchObject({
      platform: "NAVER",
      externalId: null,
      url: null,
      name: "Harimood Beomgye",
      matchConfidence: 100,
    });
  });

  it("builds a corrected Naver snapshot from a numeric Place ID", () => {
    const place = naverPlaceSnapshotFromPlaceId("2059222523", {
      businessName: "Fallback Business",
      businessAddress: "Fallback Address",
      existingPlace: {
        name: "Grains Cookies Bukchon",
        address: "Seoul Jongno-gu Bukchon-ro 11-gil 1",
        category: "Bakery",
      },
    });

    expect(place).toMatchObject({
      platform: "NAVER",
      externalId: "2059222523",
      url: "https://map.naver.com/p/entry/place/2059222523",
      name: "Grains Cookies Bukchon",
      address: "Seoul Jongno-gu Bukchon-ro 11-gil 1",
      category: "Bakery",
      matchConfidence: 100,
    });
  });

  it("rejects URLs and non-numeric values in the Place ID field", () => {
    const source = {
      businessName: "Fallback Business",
      businessAddress: "Fallback Address",
    };

    expect(
      naverPlaceSnapshotFromPlaceId(
        "https://map.naver.com/p/entry/place/2059222523",
        source,
      ),
    ).toBeNull();
    expect(naverPlaceSnapshotFromPlaceId("2059222523abc", source)).toBeNull();
  });

  it("removes non-SmartPlace links from Naver Local Search candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        responseJson({
          items: [
            {
              title: "Harimood Beomgye",
              link: "https://blog.naver.com/some-blog-post",
              category: "Restaurant",
              roadAddress: "Gyeonggi Anyang",
            },
          ],
        })
      )
    );

    const result = await findNaverCandidates({
      name: "Harimood Beomgye",
      address: "Gyeonggi Anyang",
      lat: null,
      lng: null,
    });

    expect(result.providerConfigured).toBe(true);
    expect(result.candidates[0]).toMatchObject({
      title: "Harimood Beomgye",
      link: "",
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
