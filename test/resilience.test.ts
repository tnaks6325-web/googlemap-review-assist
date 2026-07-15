import { describe, expect, it, vi } from "vitest";
import { retryExternalOperation } from "@/lib/resilience";

describe("external operation retry", () => {
  it("retries transient failures with a bounded attempt count", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValue("ok");

    await expect(retryExternalOperation(operation, { attempts: 2, baseDelayMs: 0 })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent 4xx failure", async () => {
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 }));

    await expect(retryExternalOperation(operation, { attempts: 3, baseDelayMs: 0 })).rejects.toThrow("bad request");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
