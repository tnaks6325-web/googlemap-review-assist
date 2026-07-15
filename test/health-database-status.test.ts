import { describe, expect, it } from "vitest";
import { classifyDatabaseHealthError } from "@/lib/health-database-status";

describe("database health error classification", () => {
  it("identifies a missing Prisma table without returning the original error", () => {
    expect(classifyDatabaseHealthError({ code: "P2021", message: "sensitive database detail" })).toBe("schema_missing");
  });

  it("identifies unavailable database connections", () => {
    expect(classifyDatabaseHealthError({ code: "P1001" })).toBe("connection_unavailable");
    expect(classifyDatabaseHealthError({ code: "P1017" })).toBe("connection_unavailable");
  });

  it("identifies database timeouts and keeps unknown errors generic", () => {
    expect(classifyDatabaseHealthError({ code: "P2024" })).toBe("database_timeout");
    expect(classifyDatabaseHealthError(new Error("postgresql://secret-host"))).toBe("database_error");
  });
});
