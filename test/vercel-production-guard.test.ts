import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guardScript = "scripts/vercel-production-guard.mjs";

function runGuard(environment: Record<string, string>) {
  return spawnSync(process.execPath, [guardScript], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      VERCEL_ENV: "",
      VERCEL_GIT_COMMIT_REF: "",
      VERCEL_GIT_COMMIT_SHA: "",
      ...environment,
    },
  });
}

describe("Vercel production deployment guard", () => {
  it("cancels a production deployment that was started from a feature branch", () => {
    const result = runGuard({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "codex/restore-virtual-reviewer-styles",
      VERCEL_GIT_COMMIT_SHA: "efa426d",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Only main is allowed");
  });

  it("cancels a production deployment with no Git provenance", () => {
    const result = runGuard({ VERCEL_ENV: "production" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("without Git provenance");
  });

  it("continues a production deployment only for main with a commit SHA", () => {
    const result = runGuard({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: "bc9075d",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Allowing production deployment");
  });

  it("allows a separately configured protected test branch", () => {
    const result = runGuard({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "test",
      VERCEL_GIT_COMMIT_SHA: "bc9075d",
      VERCEL_ALLOWED_PRODUCTION_BRANCH: "test",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("test");
  });

  it("keeps preview deployments available for pull-request review", () => {
    const result = runGuard({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "codex/restore-virtual-reviewer-styles",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Allowing preview deployment");
  });

  it("registers the guard as Vercel's build ignore command", () => {
    const vercelConfiguration = JSON.parse(readFileSync("vercel.json", "utf8"));

    expect(vercelConfiguration.ignoreCommand).toBe(
      "node scripts/vercel-production-guard.mjs",
    );
  });
});
