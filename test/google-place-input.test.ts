import { describe, expect, it } from "vitest";
import { parseGooglePlaceInput } from "@/lib/domain/external-places";
import { safeGoogleMapsUrl } from "@/lib/domain/google-maps-link";

describe("Google place input parsing", () => {
  it("accepts Google short and share landing URLs for later expansion", () => {
    expect(parseGooglePlaceInput("https://maps.app.goo.gl/abc123")).toMatchObject({
      kind: "URL",
      url: "https://maps.app.goo.gl/abc123",
    });
    expect(parseGooglePlaceInput("https://share.google/iNjppG3Gmoa3Yxwa4")).toMatchObject({
      kind: "URL",
      url: "https://share.google/iNjppG3Gmoa3Yxwa4",
    });
  });

  it("accepts localized Google Maps place URLs from short-link redirects", () => {
    expect(parseGooglePlaceInput("https://www.google.co.kr/maps/place/Test+Place/@37.1,127.2,17z")).toMatchObject({
      kind: "URL",
      textQuery: "Test Place",
    });
  });
});

describe("safeGoogleMapsUrl", () => {
  it("returns only HTTPS Google Maps landing URLs", () => {
    expect(
      safeGoogleMapsUrl(
        "https://www.google.com/maps/search/?api=1&query_place_id=ChIJtest123",
      ),
    ).toBe(
      "https://www.google.com/maps/search/?api=1&query_place_id=ChIJtest123",
    );
    expect(safeGoogleMapsUrl("https://maps.app.goo.gl/abc123")).toBe(
      "https://maps.app.goo.gl/abc123",
    );

    expect(safeGoogleMapsUrl("javascript:alert(1)")).toBeNull();
    expect(safeGoogleMapsUrl("http://www.google.com/maps/place/test")).toBeNull();
    expect(safeGoogleMapsUrl("https://example.com/maps/place/test")).toBeNull();
  });
});
