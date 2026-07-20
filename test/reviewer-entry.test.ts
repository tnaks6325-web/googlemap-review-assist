import { describe, expect, it } from "vitest";
import { getInitialReviewerStep } from "@/lib/auth/reviewer-entry";

describe("reviewer entry", () => {
  it("starts a signed-in Google reviewer at campaign availability", () => {
    expect(getInitialReviewerStep(true)).toBe("summary");
  });

  it("shows Google sign-in when there is no reviewer session", () => {
    expect(getInitialReviewerStep(false)).toBe("signIn");
  });
});
