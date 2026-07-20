import { describe, expect, it } from "vitest";
import { REVIEWER_ROUTES } from "@/lib/reviewer-navigation";

describe("reviewer account navigation", () => {
  it("keeps profile editing and settlement requests on separate routes", () => {
    expect(REVIEWER_ROUTES.profile).toBe("/me");
    expect(REVIEWER_ROUTES.settlement).toBe("/me/settlement");
    expect(REVIEWER_ROUTES.profile).not.toBe(REVIEWER_ROUTES.settlement);
  });
});
