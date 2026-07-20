import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/reviewer/logout/route";
import { REVIEWER_COOKIE } from "@/lib/auth/session";

describe("reviewer logout", () => {
  it("expires only the reviewer session cookie", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/reviewer/logout", {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "http://localhost",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${REVIEWER_COOKIE}=`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("rejects a cross-origin logout request", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/reviewer/logout", {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "https://attacker.example",
        },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
