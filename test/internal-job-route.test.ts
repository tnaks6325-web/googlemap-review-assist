import { afterEach, describe, expect, it } from "vitest";

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("내부 작업 워커 HTTP 계약", () => {
  it("Cron GET 요청은 Bearer 인증 후 기본 작업 수를 처리한다", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const { GET } = await import("@/app/api/internal/jobs/process/route");
    const response = await GET(new Request("http://localhost/api/internal/jobs/process", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ claimed: expect.any(Number) });
  });

  it("인증 없는 요청은 작업을 처리하지 않는다", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const { GET } = await import("@/app/api/internal/jobs/process/route");
    const response = await GET(new Request("http://localhost/api/internal/jobs/process"));

    expect(response.status).toBe(401);
  });
});
