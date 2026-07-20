import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { normalizeClientErrorReport } from "@/lib/client-error-report";

afterEach(async () => {
  await prisma.operationalError.deleteMany({ where: { source: "BROWSER" } });
});

describe("client error report normalization", () => {
  it("accepts only bounded, sanitized fields and removes query strings", () => {
    const report = normalizeClientErrorReport({
      kind: "hydration",
      message: "Hydration failed for user@example.com token=secret",
      name: "Error",
      path: "/admin/campaigns?session=secret",
      browser: "Example Browser",
    });

    expect(report).toMatchObject({
      kind: "hydration",
      name: "Error",
      path: "/admin/campaigns",
      browser: "Example Browser",
    });
    expect(report?.message).not.toContain("user@example.com");
    expect(report?.message).not.toContain("secret");
  });

  it("rejects malformed or unsupported reports", () => {
    expect(normalizeClientErrorReport(null)).toBeNull();
    expect(normalizeClientErrorReport({ kind: "navigation", message: "x" })).toBeNull();
    expect(normalizeClientErrorReport({ kind: "error", message: "" })).toBeNull();
  });

  it("stores a same-origin browser error as a natural-language operational error", async () => {
    const { POST } = await import("@/app/api/error-logs/client/route");
    const response = await POST(
      new Request("http://localhost/api/error-logs/client", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
        },
        body: JSON.stringify({
          kind: "hydration",
          message: "Hydration failed password=secret",
          name: "Error",
          path: "/admin",
          browser: "Test Browser",
        }),
      }),
    );

    expect(response.status).toBe(202);
    const stored = await prisma.operationalError.findFirst({ where: { source: "BROWSER" } });
    expect(stored).toMatchObject({
      code: "CLIENT_HYDRATION_ERROR",
      workflow: "화면 사용",
      stage: "React 화면 연결",
    });
    expect(stored?.technicalMessage).not.toContain("secret");
  });

  it("rejects browser reports without a same-origin browser request", async () => {
    const { POST } = await import("@/app/api/error-logs/client/route");
    const response = await POST(
      new Request("http://localhost/api/error-logs/client", {
        method: "POST",
        body: JSON.stringify({ kind: "error", message: "x" }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
