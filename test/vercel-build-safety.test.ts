import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vercelBuildScript = readFileSync("scripts/vercel-build.mjs", "utf8");

describe("Vercel production build safety", () => {
  it("does not synchronize the shared production schema during an application deploy", () => {
    expect(vercelBuildScript).toContain("Skipping automatic production PostgreSQL schema synchronization.");
    expect(vercelBuildScript).not.toContain('run("npx", ["prisma", "db", "push"');
  });
});
