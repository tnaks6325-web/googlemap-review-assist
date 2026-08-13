import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellSource = readFileSync("components/admin/AdminShell.tsx", "utf8");
const librarySource = readFileSync("components/admin/AdminReviewDraftPersonaLibrary.tsx", "utf8");
const fineTuningPageSource = readFileSync("app/admin/fine-tuning/page.tsx", "utf8");
const reviewStylesPageSource = readFileSync("app/admin/review-styles/page.tsx", "utf8");

describe("persona-centered advanced tuning UI", () => {
  it("keeps basic persona style available without Vertex tuning and exposes advanced tuning inside the card", () => {
    expect(librarySource).toContain("기본 스타일은 즉시 원고 생성에 적용됩니다.");
    expect(librarySource).toContain("AdminFineTuningPanel");
    expect(librarySource).toContain("고급 튜닝");
  });

  it("removes the separate tuning navigation and redirects old tuning URLs to the matching persona card", () => {
    expect(shellSource).not.toContain('href: "/admin/fine-tuning"');
    expect(fineTuningPageSource).toContain('redirect(`/admin/review-styles?advancedPersonaId=${encodeURIComponent(personaId)}`)');
    expect(reviewStylesPageSource).toContain("initialAdvancedPersonaId");
  });
});
