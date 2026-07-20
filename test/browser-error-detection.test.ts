import { describe, expect, it } from "vitest";
import { isHydrationErrorMessage } from "@/lib/browser-error-detection";

describe("browser hydration error detection", () => {
  it("recognizes React hydration mismatch console messages", () => {
    expect(isHydrationErrorMessage("Hydration failed because the server rendered HTML didn't match")).toBe(true);
    expect(isHydrationErrorMessage("A tree hydrated but some attributes of the server rendered HTML didn't match")).toBe(true);
  });

  it("does not report ordinary console errors as hydration failures", () => {
    expect(isHydrationErrorMessage("Failed to load resource")).toBe(false);
    expect(isHydrationErrorMessage("User validation failed")).toBe(false);
  });
});
