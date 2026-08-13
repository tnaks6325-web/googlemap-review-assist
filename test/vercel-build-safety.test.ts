import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vercelBuildScript = readFileSync("scripts/vercel-build.mjs", "utf8");

describe("Vercel production build safety", () => {
  it("does not synchronize the shared production schema during an application deploy", () => {
    expect(vercelBuildScript).toContain("Skipping automatic production PostgreSQL schema synchronization.");
    expect(vercelBuildScript).not.toContain('run("npx", ["prisma", "db", "push"');
  });

  it("executes only the reviewed additive virtual-reviewer migration in production", () => {
    expect(vercelBuildScript).toContain('process.env.VERCEL_ENV === "production"');
    expect(vercelBuildScript).toContain('"db",');
    expect(vercelBuildScript).toContain('"execute",');
    expect(vercelBuildScript).toContain("prisma/production-review-draft-personas.sql");
  });

  it("keeps the virtual-reviewer migration explicitly additive and separate from deployment", () => {
    const migration = readFileSync("prisma/production-review-draft-personas.sql", "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/iu);
  });
});
