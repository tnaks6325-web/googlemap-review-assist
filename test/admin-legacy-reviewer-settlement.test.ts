import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellSource = readFileSync("components/admin/AdminShell.tsx", "utf8");
const reviewerPageSource = readFileSync("app/admin/reviewers/page.tsx", "utf8");
const overviewSource = readFileSync("app/admin/page.tsx", "utf8");

describe("legacy reviewer settlement administration", () => {
  it("removes the duplicate reviewer-settlement menu and routes old links to proof review", () => {
    expect(shellSource).not.toContain('href: "/admin/reviewers"');
    expect(reviewerPageSource).toContain('redirect("/admin/review-proofs")');
  });

  it("routes settlement quick actions through the Hana-bank workflow", () => {
    expect(overviewSource).toContain("AdminSettlementBulkActions");
    expect(overviewSource).not.toContain("SettlementQueue");
  });
});
