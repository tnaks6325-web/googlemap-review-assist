import { describe, expect, it } from "vitest";
import { naverSmartPlaceLink, naverSmartPlaceSearchQuery, safeNaverSmartPlaceUrl } from "@/lib/domain/naver-smartplace-link";

describe("Naver SmartPlace links", () => {
  it("uses the place name only for fallback map search links", () => {
    expect(
      naverSmartPlaceSearchQuery({
        name: "VelyB Geondae",
        address: "Seoul Gwangjin-gu 237",
        query: "VelyB Geondae Seoul Gwangjin-gu 237 VelyB Geondae",
      })
    ).toBe("VelyB Geondae");

    expect(
      decodeURIComponent(
        naverSmartPlaceLink({
          name: "VelyB Geondae",
          address: "Seoul Gwangjin-gu 237",
          query: "VelyB Geondae Seoul Gwangjin-gu 237 VelyB Geondae",
        }) ?? ""
      )
    ).toBe("https://map.naver.com/p/search/VelyB Geondae");
  });

  it("canonicalizes verified SmartPlace URLs and rejects non-SmartPlace links", () => {
    expect(safeNaverSmartPlaceUrl("https://map.naver.com/p/entry/place/1234567890")).toBe(
      "https://map.naver.com/p/entry/place/1234567890"
    );
    expect(safeNaverSmartPlaceUrl("https://blog.naver.com/example")).toBeNull();
  });

  it("opens Naver search-result place links as SmartPlace detail links", () => {
    expect(safeNaverSmartPlaceUrl("https://map.naver.com/p/search/grains/place/1234567890")).toBe(
      "https://map.naver.com/p/entry/place/1234567890"
    );
    expect(safeNaverSmartPlaceUrl("https://map.naver.com/p/search/grains?pinId=1234567890")).toBe(
      "https://map.naver.com/p/entry/place/1234567890"
    );
  });

  it("canonicalizes copied pcmap SmartPlace detail links", () => {
    expect(safeNaverSmartPlaceUrl("https://pcmap.place.naver.com/restaurant/2059222523/home?entry=bmp")).toBe(
      "https://map.naver.com/p/entry/place/2059222523"
    );
  });
});
