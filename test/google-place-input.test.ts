import { describe, expect, it } from "vitest";
import { parseGooglePlaceInput } from "@/lib/domain/external-places";

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
