import { describe, expect, it } from "vitest";
import {
  decideReviewProofAnalysis,
  reviewProofSimilarity,
} from "@/lib/domain/review-proof-analysis";

describe("review proof AI analysis", () => {
  it("scores a screenshot OCR text as highly similar when it contains the generated draft", () => {
    const draft = "안국 그래인스쿠키 북촌점에 방문했습니다. 카페답게 이용하기 편했고 전체적으로 만족스러운 시간이었습니다.";
    const extracted = `Google 지도 리뷰 작성 완료\n별점 5개\n${draft}\n게시됨`;

    expect(reviewProofSimilarity(draft, extracted)).toBeGreaterThanOrEqual(0.9);
    expect(decideReviewProofAnalysis({ draftText: draft, extractedText: extracted, provider: "test" })).toMatchObject({
      status: "AUTO_APPROVE",
      reason: "DRAFT_TEXT_MATCHED",
    });
  });

  it("routes unrelated OCR text to automatic rejection when enough text is readable", () => {
    const draft = "안국 그래인스쿠키 북촌점에 방문했습니다. 카페답게 이용하기 편했고 전체적으로 만족스러운 시간이었습니다.";
    const extracted = "전혀 다른 장소에 대한 리뷰입니다. 주차장과 병원 접수 대기 시간이 길었다는 내용만 포함되어 있습니다.";

    const result = decideReviewProofAnalysis({ draftText: draft, extractedText: extracted, provider: "test" });

    expect(result.similarity).toBeLessThanOrEqual(0.18);
    expect(result).toMatchObject({ status: "AUTO_REJECT", reason: "DRAFT_TEXT_MISMATCHED" });
  });

  it("keeps unreadable screenshots in manual review instead of paying points", () => {
    const result = decideReviewProofAnalysis({
      draftText: "생성된 원고입니다.",
      extractedText: "",
      provider: "test",
    });

    expect(result).toMatchObject({ status: "UNAVAILABLE", reason: "OCR_TEXT_UNAVAILABLE" });
  });

  it("approves a Google Maps review screenshot when the visible text before 더보기 matches the generated draft prefix", () => {
    const draft =
      "따뜻하고 건강한 한 끼가 생각날 때 방문하기 좋은 동양솥밥 안산본점에 다녀왔어요. 이번에 주문한 메뉴는 전복솥밥과 장어솥밥이었는데 재료가 신선하고 정갈해서 만족스러웠습니다. 직원분들도 친절하고 매장 분위기도 깔끔해서 다음에도 방문하고 싶어요.";
    const extracted = `
리뷰
동양솥밥 안산본점
정렬 기준
관련성순 최신순 높은 평점순 낮은 평점순
이상미
지역 가이드 · 리뷰 40개 · 사진 156장
별점 5개 2주 전 신규
따뜻하고 건강한 한 끼가 생각날 때 방문하기 좋은 동양솥밥 안산본점에 다녀왔어요.

이번에 주문한 메뉴는 전복솥밥과 장어솥밥 ... 더보기
반응하려면 길게 누르세요.
`;

    const result = decideReviewProofAnalysis({ draftText: draft, extractedText: extracted, provider: "test" });

    expect(result.similarity).toBeGreaterThanOrEqual(0.72);
    expect(result).toMatchObject({ status: "AUTO_APPROVE" });
  });

  it("does not approve a screenshot from text that appears only after 더보기", () => {
    const draft =
      "따뜻하고 건강한 한 끼가 생각날 때 방문하기 좋은 동양솥밥 안산본점에 다녀왔어요. 전복솥밥과 장어솥밥이 모두 만족스러웠습니다.";
    const extracted = `
리뷰
동양솥밥 안산본점
별점 5개
완전히 다른 내용의 리뷰가 먼저 보입니다. 포장 대기와 주차 이야기만 적혀 있습니다 ... 더보기
${draft}
`;

    const result = decideReviewProofAnalysis({ draftText: draft, extractedText: extracted, provider: "test" });

    expect(result).not.toMatchObject({ status: "AUTO_APPROVE" });
  });

  it("checks every visible review block when a screenshot contains multiple 더보기 buttons", () => {
    const draft =
      "범계 술집 잔잔은 평일에 방문하기 좋았고 조용한 분위기에서 안주와 술을 편하게 즐길 수 있었어요. 직원분들도 친절해서 만족스러웠습니다.";
    const extracted = `
리뷰
이자카야 잔잔 범계역점
SEHEE
리뷰 3개 · 사진 7장
범계술집 찾아보다가 평점이 좋아서 방문했는데 매장이 넓고 메뉴도 다양했어요 ... 더보기
seulgi Lee
리뷰 5개 · 사진 19장
범계 술집 잔잔은 평일에 방문하기 좋았고 조용한 분위기에서 안주와 술을 편하게 즐길 수 있었어요. 직원분들도 친절해서 만족스러웠습니다 ... 더보기
`;

    const result = decideReviewProofAnalysis({ draftText: draft, extractedText: extracted, provider: "test" });

    expect(result.similarity).toBeGreaterThanOrEqual(0.72);
    expect(result).toMatchObject({ status: "AUTO_APPROVE" });
  });

  it("approves a fully expanded Google Maps review screenshot without 더보기 when the whole draft is visible", () => {
    const draft =
      "따뜻하고 건강한 한 끼가 생각날 때 방문하기 좋은 동양솥밥 안산본점에 다녀왔어요. 이번에 주문한 메뉴는 전복솥밥과 장어솥밥! 갓 지은 솥밥 특유의 고소한 향과 쫀득한 밥맛이 정말 좋았고, 전복솥밥은 탱글한 전복과 담백한 풍미가 어우러져 깔끔하면서도 든든한 맛이었어요. 장어솥밥은 부드러운 장어와 달콤 짭조름한 양념이 잘 어우러져 보양식으로도 만족스러웠답니다. 솥밥을 먹고 난 뒤 따뜻한 누룽지까지 즐길 수 있어 마지막까지 든든했던 한 끼였어요. 깔끔한 매장 분위기라 가족 식사나 부모님과 함께 방문하기에도 좋은 안산 솥밥 맛집으로 추천하고 싶은 곳입니다.";
    const extracted = `
google.com
이상미
지역 가이드 · 리뷰 40개 · 사진 156장
별점 5개 2주 전 신규
${draft}
음식: 5/5  |  서비스: 5/5  |  분위기: 5/5
반응하려면 길게 누르세요.
`;

    const result = decideReviewProofAnalysis({ draftText: draft, extractedText: extracted, provider: "test" });

    expect(result.similarity).toBeGreaterThanOrEqual(0.9);
    expect(result).toMatchObject({ status: "AUTO_APPROVE" });
  });

  it("auto-approves only when a matching place name, five-star evidence, and recent review date are present", () => {
    const draft = "그대만의 작은공간 오전점에서 가족 식사를 했는데 음식이 맛있고 직원분들도 친절해서 만족스러웠습니다.";
    const extracted = `
리뷰
그대만의 작은공간 오전점
별점 5개 방금 전 신규
${draft}
반응하려면 길게 누르세요.
`;

    const result = decideReviewProofAnalysis({
      draftText: draft,
      extractedText: extracted,
      expectedPlaceName: "그대만의 작은공간 오전점",
      provider: "test",
    });

    expect(result).toMatchObject({
      status: "AUTO_APPROVE",
      checks: {
        placeName: "PASS",
        rating: "PASS",
        recency: "PASS",
      },
    });
  });

  it("rejects a matching review proof when the screenshot indicates a non-five-star review", () => {
    const draft = "투파인드피터 범계점은 분위기도 좋고 음식도 만족스러워서 다시 방문하고 싶은 곳이었습니다.";
    const extracted = `
리뷰
투파인드피터 범계점
별점 4개 방금 전
${draft}
음식: 4/5 | 서비스: 5/5 | 분위기: 4/5
`;

    const result = decideReviewProofAnalysis({
      draftText: draft,
      extractedText: extracted,
      expectedPlaceName: "투파인드피터 범계점",
      provider: "test",
    });

    expect(result).toMatchObject({ status: "AUTO_REJECT", reason: "RATING_NOT_FIVE_STAR" });
  });

  it("rejects a matching review proof when the visible review date is too old", () => {
    const draft = "이자카야 잔잔 범계역점은 안주도 맛있고 조용하게 술 한잔하기 좋은 곳이었습니다.";
    const extracted = `
리뷰
이자카야 잔잔 범계역점
별점 5개 1년 전
${draft}
`;

    const result = decideReviewProofAnalysis({
      draftText: draft,
      extractedText: extracted,
      expectedPlaceName: "이자카야 잔잔 범계역점",
      provider: "test",
    });

    expect(result).toMatchObject({ status: "AUTO_REJECT", reason: "REVIEW_TOO_OLD" });
  });

  it("auto-approves a matching proof when the place name is not visible in the OCR text", () => {
    const draft = "고기를 맛있게 먹었고 직원분들이 친절해서 만족스러운 식사였습니다.";
    const extracted = `
리뷰
별점 5개 방금 전
${draft}
`;

    const result = decideReviewProofAnalysis({
      draftText: draft,
      extractedText: extracted,
      expectedPlaceName: "준식당",
      provider: "test",
    });

    expect(result).toMatchObject({ status: "AUTO_APPROVE", reason: "DRAFT_TEXT_MATCHED" });
  });

  it("auto-approves an 80%+ matching proof even when rating and recency OCR metadata are unavailable", () => {
    const draft = "생성 원고와 동일한 리뷰 문구입니다.";
    const extracted = `
리뷰
테스트 매장
${draft}
`;

    const result = decideReviewProofAnalysis({
      draftText: draft,
      extractedText: extracted,
      expectedPlaceName: "테스트 매장",
      provider: "test",
    });

    expect(result.similarity).toBeGreaterThanOrEqual(0.8);
    expect(result).toMatchObject({ status: "AUTO_APPROVE", reason: "DRAFT_TEXT_MATCHED" });
  });
});
