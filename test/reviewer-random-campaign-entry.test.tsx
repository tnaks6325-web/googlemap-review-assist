import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReviewerCampaignPanel } from "@/components/campaign/ReviewerDashboardPanels";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("reviewer random campaign entry", () => {
  it("shows one participation action without exposing a place card", () => {
    const html = renderToStaticMarkup(
      <ReviewerCampaignPanel availableCount={4} totalRewardPoints={2000} />,
    );

    expect(html).toContain("참여하기");
    expect(html).toContain("랜덤");
    expect(html).not.toContain("업체명");
    expect(html).not.toContain("주소");
    expect(html).not.toContain("Google 지도");
  });
});
