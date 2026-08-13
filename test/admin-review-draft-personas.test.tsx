import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin virtual reviewer styles", () => {
  it("protects persona mutations and does not fetch reference URLs", () => {
    const collectionRoute = readFileSync("app/api/admin/review-draft-personas/route.ts", "utf8");
    const itemRoute = readFileSync("app/api/admin/review-draft-personas/[personaId]/route.ts", "utf8");
    const exampleRoute = readFileSync("app/api/admin/review-draft-personas/[personaId]/examples/route.ts", "utf8");
    const domainSource = readFileSync("lib/domain/review-draft-personas.ts", "utf8");

    expect(collectionRoute).toContain("checkOrigin(req)");
    expect(collectionRoute).toContain("getAdminId()");
    expect(itemRoute).toContain("checkOrigin(req)");
    expect(exampleRoute).toContain("appendReviewDraftPersonaExample");
    expect(domainSource).toContain("url.protocol !== \"https:\"");
    expect(domainSource).not.toContain("fetch(");
    expect(domainSource).toContain("REVIEW_DRAFT_PERSONA_IN_USE");
  });

  it("makes the restored library available from the administrator navigation", () => {
    const shellSource = readFileSync("components/admin/AdminShell.tsx", "utf8");
    const pageSource = readFileSync("app/admin/review-styles/page.tsx", "utf8");

    expect(shellSource).toContain('href: "/admin/review-styles"');
    expect(pageSource).toContain("AdminReviewDraftPersonaLibrary");
  });
});
