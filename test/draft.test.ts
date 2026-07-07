import { afterEach, describe, expect, it } from "vitest";
import { generateDraftResult, selectDraftProvider } from "@/lib/domain/draft";

const originalProvider = process.env.AI_DRAFT_PROVIDER;
const originalKey = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (originalProvider == null) delete process.env.AI_DRAFT_PROVIDER;
  else process.env.AI_DRAFT_PROVIDER = originalProvider;

  if (originalKey == null) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

describe("draft provider selection", () => {
  it("uses the template provider when no Anthropic key is configured", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_DRAFT_PROVIDER;

    expect(selectDraftProvider()).toBe("template");
  });

  it("allows forcing the template provider even when an Anthropic key exists", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.AI_DRAFT_PROVIDER = "template";

    expect(selectDraftProvider()).toBe("template");
  });
});

describe("template draft generation", () => {
  it("uses only submitted reviewer inputs and not unselected menu catalog items", async () => {
    process.env.AI_DRAFT_PROVIDER = "template";
    process.env.ANTHROPIC_API_KEY = "test-key";

    const result = await generateDraftResult({
      businessName: "Test Bistro",
      rating: 5,
      selectedMenus: ["Pasta"],
      comment: "fresh sauce",
      menuCatalog: ["Pasta", "Steak", "Burger"],
    });

    expect(result.provider).toBe("template");
    expect(result.text).toContain("Pasta");
    expect(result.text).toContain("fresh sauce");
    expect(result.text).not.toContain("Steak");
    expect(result.text).not.toContain("Burger");
  });
});
