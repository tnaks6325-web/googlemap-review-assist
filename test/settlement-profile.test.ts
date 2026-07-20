import { describe, expect, it } from "vitest";
import { needsReviewerSettlementProfile } from "@/lib/domain/settlement";

describe("reviewer settlement profile readiness", () => {
  it("requires a name, contact number, and payout account", () => {
    expect(
      needsReviewerSettlementProfile({
        name: "Reviewer Name",
        phone: "01012345678",
        hasPayoutAccount: true,
      }),
    ).toBe(false);

    expect(
      needsReviewerSettlementProfile({
        name: "Reviewer Name",
        phone: null,
        hasPayoutAccount: true,
      }),
    ).toBe(true);

    expect(
      needsReviewerSettlementProfile({
        name: "Reviewer Name",
        phone: "01012345678",
        hasPayoutAccount: false,
      }),
    ).toBe(true);
  });
});
