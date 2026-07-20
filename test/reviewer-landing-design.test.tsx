import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReviewerHero } from "@/components/campaign/ReviewerHero";
import { ReviewerGuestDock } from "@/components/campaign/ReviewerGuestDock";
import { ReviewerLandingArtwork } from "@/components/campaign/ReviewerLandingArtwork";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe("reviewer mobile landing design", () => {
  it("shows the approved brand message and redesigned summary cards", () => {
    const html = renderToStaticMarkup(
      <ReviewerHero
        account={null}
        availableCount={5}
        totalRewardPoints={2500}
      />,
    );

    expect(html).toContain("클릭 열번으로 끝내는 초간단 부업");
    expect(html).toContain("아이에이 플레이스");
    expect(html).toContain("오늘 참여 가능");
    expect(html).toContain("2,500");
    expect(html).toContain("TODAY");
    expect(html).toContain("REWARD");
    expect(html).not.toContain("Google 계정으로 로그인");
  });

  it("includes a review illustration with restaurant and cafe context", () => {
    const html = renderToStaticMarkup(<ReviewerLandingArtwork />);

    expect(html).toContain('aria-label="스마트폰으로 맛집 리뷰를 작성하는 사람"');
    expect(html).toContain('data-place-icon="cafe"');
    expect(html).toContain('data-place-icon="restaurant"');
    expect(html).toContain('data-place-icon="dessert"');
  });

  it("places Google sign-in above the readable bottom navigation", () => {
    const html = renderToStaticMarkup(<ReviewerGuestDock />);

    expect(html).toContain("Google 계정으로 로그인");
    expect(html).toContain("캠페인");
    expect(html).toContain("참여내역");
    expect(html).toContain("내 정보");
    expect(html).toContain('aria-label="리뷰어 주요 메뉴"');
    expect(html).toContain('data-google-placeholder="true"');
  });
});
