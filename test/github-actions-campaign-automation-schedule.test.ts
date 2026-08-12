import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vercelConfig = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
const dailyWorkflow = readFileSync(
  new URL("../.github/workflows/campaign-automation-daily.yml", import.meta.url),
  "utf8",
);
const workerWorkflow = readFileSync(
  new URL("../.github/workflows/campaign-automation-worker.yml", import.meta.url),
  "utf8",
);

describe("GitHub Actions 캠페인 자동화 스케줄", () => {
  it("Vercel Hobby 배포를 막는 분 단위 Vercel Cron을 등록하지 않는다", () => {
    expect(vercelConfig).not.toContain('"crons"');
  });

  it("매일 17:05 KST에 신규 캠페인 감지 엔드포인트를 인증 호출한다", () => {
    expect(dailyWorkflow).toContain('cron: "5 8 * * *"');
    expect(dailyWorkflow).toContain("secrets.CRON_SECRET");
    expect(dailyWorkflow).toContain("/api/internal/campaign-automation/daily");
    expect(dailyWorkflow).toContain("workflow_dispatch:");
  });

  it("5분마다 작업을 한 건씩 인증 처리해 함수 실행 시간을 제한한다", () => {
    expect(workerWorkflow).toContain('cron: "*/5 * * * *"');
    expect(workerWorkflow).toContain("secrets.CRON_SECRET");
    expect(workerWorkflow).toContain("/api/internal/jobs/process");
    expect(workerWorkflow).toContain('{"limit":1}');
    expect(workerWorkflow).toContain("workflow_dispatch:");
  });
});
