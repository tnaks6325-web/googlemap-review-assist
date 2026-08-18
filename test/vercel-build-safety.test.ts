import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vercelBuildScript = readFileSync("scripts/vercel-build.mjs", "utf8");

describe("Vercel production build safety", () => {
  it("does not synchronize the shared production schema during an application deploy", () => {
    expect(vercelBuildScript).toContain("Skipping automatic production PostgreSQL schema synchronization.");
    expect(vercelBuildScript).toContain("const isIsolatedTestServerSchemaSync");
    expect(vercelBuildScript).toContain("if (isIsolatedTestServerSchemaSync)");
    expect(vercelBuildScript).not.toContain("--accept-data-loss");
  });

  it("executes the reviewed additive production migrations", () => {
    expect(vercelBuildScript).toContain('process.env.VERCEL_ENV === "production"');
    expect(vercelBuildScript).toContain('"db",');
    expect(vercelBuildScript).toContain('"execute",');
    expect(vercelBuildScript).toContain("prisma/production-review-draft-personas.sql");
    expect(vercelBuildScript).toContain("prisma/production-campaign-automation.sql");
    expect(vercelBuildScript).toContain("prisma/production-naver-visitor-review-previews.sql");
  });

  it("allows schema synchronization only when the isolated test-server flag is explicit", () => {
    expect(vercelBuildScript).toContain('process.env.ALLOW_TEST_DATABASE_SCHEMA_PUSH === "true"');
    expect(vercelBuildScript).toContain('process.env.VERCEL_ALLOWED_PRODUCTION_BRANCH === "test"');
    expect(vercelBuildScript).toContain('"push",');
  });

  it("runs test-admin bootstrap only inside the explicitly isolated test deployment", () => {
    expect(vercelBuildScript).toContain('"scripts/bootstrap-test-admin.ts"');

    const bootstrapScript = readFileSync("scripts/bootstrap-test-admin.ts", "utf8");
    expect(bootstrapScript).toContain('process.env.VERCEL_ENV === "production"');
    expect(bootstrapScript).toContain('process.env.VERCEL_ALLOWED_PRODUCTION_BRANCH === "test"');
    expect(bootstrapScript).toContain('process.env.ALLOW_TEST_DATABASE_SCHEMA_PUSH === "true"');
    expect(bootstrapScript).toContain('process.env.TEST_ADMIN_BOOTSTRAP_USERNAME');
    expect(bootstrapScript).toContain('process.env.TEST_ADMIN_BOOTSTRAP_PASSWORD');
  });

  it("creates the initial test admin atomically without replacing an existing password", () => {
    const bootstrapScript = readFileSync("scripts/bootstrap-test-admin.ts", "utf8");

    expect(bootstrapScript).toContain("prisma.admin.upsert(");
    expect(bootstrapScript).toContain("update: {},");
    expect(bootstrapScript).not.toContain("prisma.admin.findUnique(");
  });

  it("keeps the virtual-reviewer migration explicitly additive and separate from deployment", () => {
    const migration = readFileSync("prisma/production-review-draft-personas.sql", "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/iu);
  });

  it("keeps the campaign automation migration explicitly additive", () => {
    const migration = readFileSync("prisma/production-campaign-automation.sql", "utf8");

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "CampaignAutomationControl"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "automationEnabled"');
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/iu);
  });

  it("keeps the Naver visitor-review preview migration explicitly additive", () => {
    const migration = readFileSync("prisma/production-naver-visitor-review-previews.sql", "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "NaverVisitorReviewRun"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "NaverVisitorReviewPreview"');
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)/iu);
  });
});
