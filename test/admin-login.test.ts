import { describe, expect, it } from "vitest";

describe("dev admin login bypass", () => {
  it("issues an admin session in non-production when devBypass is requested", async () => {
    const prevBypass = process.env.ADMIN_DEV_BYPASS;
    delete process.env.ADMIN_DEV_BYPASS;

    try {
      const { POST } = await import("@/app/api/admin/login/route");
      const res = await POST(
        new Request("http://localhost/api/admin/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ devBypass: true }),
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toMatchObject({ adminId: "dev-admin", devBypass: true });
      expect(res.headers.get("set-cookie")).toContain("ad_session=");
    } finally {
      if (prevBypass === undefined) delete process.env.ADMIN_DEV_BYPASS;
      else process.env.ADMIN_DEV_BYPASS = prevBypass;
    }
  });

  it("rejects devBypass when ADMIN_DEV_BYPASS is disabled", async () => {
    const prevBypass = process.env.ADMIN_DEV_BYPASS;
    process.env.ADMIN_DEV_BYPASS = "0";

    try {
      const { POST } = await import("@/app/api/admin/login/route");
      const res = await POST(
        new Request("http://localhost/api/admin/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ devBypass: true }),
        })
      );
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error.code).toBe("DEV_BYPASS_DISABLED");
      expect(res.headers.get("set-cookie")).toBeNull();
    } finally {
      if (prevBypass === undefined) delete process.env.ADMIN_DEV_BYPASS;
      else process.env.ADMIN_DEV_BYPASS = prevBypass;
    }
  });
});
