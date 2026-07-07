import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveGooglePlace } from "@/lib/domain/external-place-providers";

const originalKey = process.env.GOOGLE_PLACES_API_KEY;

function responseJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function redirect(location: string) {
  return new Response(null, {
    status: 302,
    headers: { location },
  });
}

describe("resolveGooglePlace landing URL normalization", () => {
  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = "test-google-places-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalKey == null) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = originalKey;
  });

  it("expands maps.app.goo.gl landing URLs before resolving with text search", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://maps.app.goo.gl/abc123") {
        return redirect("https://www.google.co.kr/maps/place/Test+Place/@37.1,127.2,17z");
      }

      if (url === "https://places.googleapis.com/v1/places:searchText") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          textQuery: "Test Place",
          languageCode: "ko",
        });
        return responseJson({
          places: [
            {
              id: "ChIJresolved",
              displayName: { text: "Test Place" },
              formattedAddress: "Seoul",
              googleMapsUri: "https://maps.google.com/?cid=1",
              location: { latitude: 37.1, longitude: 127.2 },
              rating: 4.8,
              userRatingCount: 12,
            },
          ],
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGooglePlace("https://maps.app.goo.gl/abc123");

    expect(result.providerConfigured).toBe(true);
    expect(result.place).toMatchObject({
      externalId: "ChIJresolved",
      name: "Test Place",
      url: "https://maps.google.com/?cid=1",
      rating: 4.8,
      reviewCount: 12,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the search query from share.google redirects", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://share.google/iNjppG3Gmoa3Yxwa4") {
        return redirect("https://www.google.com/search?q=Shared+Place&kgmid=%2Fg%2Fabc");
      }

      if (url === "https://places.googleapis.com/v1/places:searchText") {
        expect(JSON.parse(String(init?.body))).toMatchObject({ textQuery: "Shared Place" });
        return responseJson({
          places: [
            {
              id: "ChIJshared",
              displayName: { text: "Shared Place" },
              googleMapsUri: "https://maps.google.com/?cid=2",
            },
          ],
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGooglePlace("https://share.google/iNjppG3Gmoa3Yxwa4");

    expect(result.place).toMatchObject({
      externalId: "ChIJshared",
      name: "Shared Place",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps only the primary local name when Google returns multilingual display names", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://places.googleapis.com/v1/places/ChIJmulti") {
        return responseJson({
          id: "ChIJmulti",
          displayName: { text: "Local Place Name | English Place Name | Japanese Place Name" },
          formattedAddress: "Seoul",
          googleMapsUri: "https://maps.google.com/?cid=4",
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGooglePlace("ChIJmulti");

    expect(result.place.name).toBe("Local Place Name");
  });

  it("prefers the Google Maps type label for category when available", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://places.googleapis.com/v1/places/ChIJtype") {
        expect(new Headers(init?.headers).get("X-Goog-FieldMask")).toContain("googleMapsTypeLabel");
        return responseJson({
          id: "ChIJtype",
          displayName: { text: "Type Place" },
          googleMapsTypeLabel: { text: "카페" },
          primaryTypeDisplayName: { text: "커피숍" },
          primaryType: "cafe",
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGooglePlace("ChIJtype");

    expect(result.place.category).toBe("카페");
  });

  it("continues past the intermediate google share token URL before text search", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://share.google/iNjppG3Gmoa3Yxwa4") {
        return redirect("https://www.google.com/share.google?q=iNjppG3Gmoa3Yxwa4");
      }

      if (url === "https://www.google.com/share.google?q=iNjppG3Gmoa3Yxwa4") {
        return redirect(
          "https://www.google.com/search?kgmid=/g/11y3ms_1hp&q=%EC%95%88%EA%B5%AD+%EA%B7%B8%EB%9E%98%EC%9D%B8%EC%8A%A4%EC%BF%A0%ED%82%A4+%EB%B6%81%EC%B4%8C%EC%A0%90"
        );
      }

      if (url === "https://places.googleapis.com/v1/places:searchText") {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          textQuery: "안국 그래인스쿠키 북촌점",
        });
        return responseJson({
          places: [
            {
              id: "ChIJshareResolved",
              displayName: { text: "안국 그레인스쿠키 북촌점" },
              formattedAddress: "서울 종로구",
              googleMapsUri: "https://maps.google.com/?cid=3",
            },
          ],
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGooglePlace("https://share.google/iNjppG3Gmoa3Yxwa4");

    expect(result.place).toMatchObject({
      externalId: "ChIJshareResolved",
      name: "안국 그레인스쿠키 북촌점",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
