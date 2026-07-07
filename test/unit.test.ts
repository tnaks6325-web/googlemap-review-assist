import { describe, it, expect } from "vitest";
import { canonicalizeCode, receiptDedupeHash } from "@/lib/domain/receipts";
import { parseReceiptText } from "@/lib/ocr/parse";
import { decideReceiptStatus } from "@/lib/domain/receipt-verify";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { translate, messages } from "@/lib/i18n/messages";
import type { OcrResult } from "@/lib/ocr/types";
import {
  parseExternalReviewsCsv,
  parseGooglePlaceInput,
  parseNaverPlaceInput,
  scorePlaceCandidate,
} from "@/lib/domain/external-places";

describe("receipt code canonicalization (R3)", () => {
  it("대소문자/공백/구분자 변형을 동일 코드로 정규화", () => {
    expect(canonicalizeCode("abc-123")).toBe("ABC123");
    expect(canonicalizeCode(" ABC 123 ")).toBe("ABC123");
    expect(canonicalizeCode("ABC123")).toBe("ABC123");
  });
  it("dedupeHash는 정규화 코드가 같으면 동일", () => {
    expect(receiptDedupeHash("biz1", "abc-123")).toBe(receiptDedupeHash("biz1", "ABC 123"));
    expect(receiptDedupeHash("biz1", "abc123")).not.toBe(receiptDedupeHash("biz2", "abc123"));
  });
});

describe("OCR 파서", () => {
  it("승인번호/금액/날짜/상호 추출", () => {
    const p = parseReceiptText("상호: 온기담은식당\n2026-06-29\n합계: 23,000\n승인번호: 12345678");
    expect(p.approvalNo).toBe("12345678");
    expect(p.amount).toBe(23000);
    expect(p.merchantName).toContain("온기담은식당");
    expect(p.fieldsFound).toBe(4);
  });
});

describe("decideReceiptStatus (fail-closed)", () => {
  const base: OcrResult = {
    approvalNo: "12345678",
    amount: 23000,
    merchantName: "온기담은식당",
    rawText: "",
    confidence: 0.9,
  };
  it("모두 충족 + 상호 포함 → VERIFIED", () => {
    expect(decideReceiptStatus(base, "온기담은식당").status).toBe("VERIFIED");
  });
  it("승인번호 없으면 PENDING", () => {
    expect(decideReceiptStatus({ ...base, approvalNo: undefined }, "온기담은식당").status).toBe("PENDING");
  });
  it("신뢰도 낮으면 PENDING", () => {
    expect(decideReceiptStatus({ ...base, confidence: 0.3 }, "온기담은식당").status).toBe("PENDING");
  });
  it("가맹점명 미인식이면 PENDING(fail-closed)", () => {
    expect(decideReceiptStatus({ ...base, merchantName: undefined }, "온기담은식당").status).toBe("PENDING");
  });
  it("가맹점 불일치 PENDING", () => {
    expect(decideReceiptStatus(base, "다른가게").status).toBe("PENDING");
  });
});

describe("i18n", () => {
  it("ko/en 사전 키가 일치", () => {
    expect(Object.keys(messages.ko).sort()).toEqual(Object.keys(messages.en).sort());
  });
  it("변수 치환", () => {
    expect(translate("ko", "balanceNow", { balance: "2,500" })).toContain("2,500");
    expect(translate("en", "ctaConfirm")).toBe("Confirm");
  });
  it("미존재 키는 키 자체 반환", () => {
    expect(translate("ko", "__missing__")).toBe("__missing__");
  });
});

describe("비밀번호 해시", () => {
  it("해시 검증 성공/실패", () => {
    const h = hashPassword("password123");
    expect(verifyPassword("password123", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
});

describe("외부 플레이스 입력 파싱", () => {
  it("구글 Place ID 직접 입력을 허용", () => {
    expect(parseGooglePlaceInput("ChIJgUbEo8cfqokR5lP9_Wh_DaM")).toMatchObject({
      kind: "PLACE_ID",
      placeId: "ChIJgUbEo8cfqokR5lP9_Wh_DaM",
    });
  });

  it("구글 지도 URL의 query_place_id를 추출", () => {
    const parsed = parseGooglePlaceInput(
      "https://www.google.com/maps/search/?api=1&query=%EC%98%A8%EA%B8%B0%EB%8B%B4%EC%9D%80%EC%8B%9D%EB%8B%B9&query_place_id=ChIJabc_123"
    );
    expect(parsed).toMatchObject({ kind: "URL", placeId: "ChIJabc_123" });
  });

  it("허용되지 않은 구글 URL host는 거부", () => {
    expect(() => parseGooglePlaceInput("https://example.com/maps/place/1")).toThrow("unsupported google host");
  });

  it("네이버 플레이스 URL에서 place id를 추출", () => {
    expect(parseNaverPlaceInput("https://map.naver.com/p/entry/place/1234567890")).toMatchObject({
      kind: "URL",
      externalId: "1234567890",
    });
  });
});

describe("공개 구글 플레이스 프리뷰 API", () => {
  it("owner 세션 없이 구글 플레이스 URL을 확인할 수 있다", async () => {
    const prevKey = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    const { POST } = await import("@/app/api/business/places/google/resolve/route");

    try {
      const res = await POST(
        new Request("http://localhost/api/business/places/google/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            urlOrPlaceId: "https://www.google.com/maps/search/?api=1&query_place_id=ChIJtest_123",
          }),
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.place).toMatchObject({
        platform: "GOOGLE",
        externalId: "ChIJtest_123",
      });
    } finally {
      if (prevKey) process.env.GOOGLE_PLACES_API_KEY = prevKey;
    }
  });
});

describe("외부 플레이스 후보 매칭", () => {
  it("상호와 주소가 가까우면 높은 신뢰도를 반환", () => {
    expect(
      scorePlaceCandidate(
        { name: "온기담은식당", address: "서울 강남구 테헤란로 10" },
        { name: "온기담은식당", address: "서울특별시 강남구 테헤란로 10", category: "음식점>한식" }
      )
    ).toBeGreaterThanOrEqual(85);
  });

  it("상호와 주소가 다르면 낮은 신뢰도를 반환", () => {
    expect(
      scorePlaceCandidate(
        { name: "온기담은식당", address: "서울 강남구 테헤란로 10" },
        { name: "다른카페", address: "부산 해운대구", category: "카페" }
      )
    ).toBeLessThan(50);
  });
});

describe("외부 리뷰 CSV import 파서", () => {
  it("CSV 리뷰를 정규화하고 영수증 리뷰 타입을 보존", () => {
    const rows = parseExternalReviewsCsv(
      "reviewType,rating,content,authorMasked,publishedAt,externalReviewId\nRECEIPT,5,친절하고 양이 많아요,ki***,2026-06-30,r1"
    );
    expect(rows).toEqual([
      {
        reviewType: "RECEIPT",
        rating: 5,
        content: "친절하고 양이 많아요",
        authorMasked: "ki***",
        publishedAt: new Date("2026-06-30T00:00:00.000Z"),
        externalReviewId: "r1",
      },
    ]);
  });
});
