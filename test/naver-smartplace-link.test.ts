import { describe, expect, it } from "vitest";
import { naverSmartPlaceLink, naverSmartPlaceSearchQuery, safeNaverSmartPlaceUrl } from "@/lib/domain/naver-smartplace-link";

describe("Naver SmartPlace links", () => {
  it("uses the place name only for fallback map search links", () => {
    expect(
      naverSmartPlaceSearchQuery({
        name: "블리비의원 건대점",
        address: "서울특별시 광진구 아차산로 237 삼진빌딩 2층",
        query: "블리비의원 건대점 서울특별시 광진구 아차산로 237 삼진빌딩 2층 블리비의원 건대점",
      })
    ).toBe("블리비의원 건대점");

    expect(
      decodeURIComponent(
        naverSmartPlaceLink({
          name: "블리비의원 건대점",
          address: "서울특별시 광진구 아차산로 237 삼진빌딩 2층",
          query: "블리비의원 건대점 서울특별시 광진구 아차산로 237 삼진빌딩 2층 블리비의원 건대점",
        }) ?? ""
      )
    ).toBe("https://map.naver.com/p/search/블리비의원 건대점");
  });

  it("keeps verified SmartPlace URLs and rejects non-SmartPlace links", () => {
    expect(safeNaverSmartPlaceUrl("https://map.naver.com/p/entry/place/1234567890")).toBe(
      "https://map.naver.com/p/entry/place/1234567890"
    );
    expect(safeNaverSmartPlaceUrl("https://blog.naver.com/example")).toBeNull();
  });
});
