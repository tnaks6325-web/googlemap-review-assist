import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const postgresSchema = readFileSync(
  new URL("../prisma/schema.postgres.prisma", import.meta.url),
  "utf8",
);

describe("PostgreSQL 캠페인 자동화 스키마", () => {
  it("운영 데이터베이스에도 자동화 실행·시트 소스·캠페인 상태 모델을 포함한다", () => {
    expect(postgresSchema).toContain("model AutomationRun");
    expect(postgresSchema).toContain("model SheetCampaignSource");
    expect(postgresSchema).toContain("model CampaignAutomationRun");
    expect(postgresSchema).toContain("sheetCampaignSource");
    expect(postgresSchema).toContain("automationRuns");
  });
});
