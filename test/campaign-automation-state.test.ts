import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  upsertDailyCampaignAutomationRun,
  upsertSheetCampaignSource,
} from "@/lib/domain/campaign-automation-state";

describe("신규 캠페인 자동화 지속 상태", () => {
  it("같은 KST 날짜의 자동화 실행은 한 번만 등록한다", async () => {
    const date = new Date("2026-07-27T08:00:00.000Z");
    const first = await upsertDailyCampaignAutomationRun(date);
    const second = await upsertDailyCampaignAutomationRun(date);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.run.id).toBe(first.run.id);
    expect(second.run.runKey).toBe("NEW_CAMPAIGN_DAILY:2026-07-27");
    expect(await prisma.automationRun.count({ where: { runKey: first.run.runKey } })).toBe(1);
  });

  it("시트 행 번호가 바뀌어도 접수ID와 업무 내용이 같으면 변경으로 처리하지 않는다", async () => {
    const receiptId = `CMP-state-${Date.now()}`;
    const input = {
      spreadsheetId: "sheet-test",
      sheetName: "광고요청시트",
      receiptId,
      advertiserName: "자동화 광고주",
      landingUrl: "https://maps.google.com/?cid=123",
      startDate: "2026-07-27",
      rowStatus: "READY" as const,
      rowPayload: {
        businessName: "자동화 매장",
        guideKeywords: ["키워드 A", "키워드 B"],
        totalQuota: 25,
      },
    };

    const first = await upsertSheetCampaignSource({ ...input, rowNumber: 6 });
    const moved = await upsertSheetCampaignSource({ ...input, rowNumber: 19 });
    const changed = await upsertSheetCampaignSource({
      ...input,
      rowNumber: 19,
      rowPayload: { ...input.rowPayload, guideKeywords: ["키워드 A", "키워드 C"] },
    });

    expect(first.change).toBe("NEW");
    expect(moved.change).toBe("UNCHANGED");
    expect(changed.change).toBe("UPDATED");
    expect(moved.source.id).toBe(first.source.id);
    expect(changed.source.rowNumber).toBe(19);
  });
});
