import { describe, expect, it } from "vitest";
import {
  campaignAutomationRunKey,
  campaignSourceKey,
  evaluateCampaignAutomationGate,
} from "@/lib/domain/campaign-automation-policy";

describe("신규 캠페인 자동화 정책", () => {
  it("UTC 시각을 KST 기준 일일 실행 멱등키로 바꾼다", () => {
    expect(campaignAutomationRunKey(new Date("2026-07-27T14:59:59.000Z"))).toBe(
      "NEW_CAMPAIGN_DAILY:2026-07-27",
    );
    expect(campaignAutomationRunKey(new Date("2026-07-27T15:00:00.000Z"))).toBe(
      "NEW_CAMPAIGN_DAILY:2026-07-28",
    );
  });

  it("영구 접수ID를 최우선 시트 원본 키로 사용한다", () => {
    expect(
      campaignSourceKey({
        receiptId: "  CMP-20260727-001 ",
        spreadsheetId: "sheet-1",
        sheetName: "광고요청시트",
        advertiserName: "광고주",
        landingUrl: "https://maps.google.com/?cid=123",
        startDate: "2026-07-27",
      }),
    ).toBe("receipt:CMP-20260727-001");
  });

  it("레거시 행은 행 번호와 무관한 정규화 해시 키를 만든다", () => {
    const base = {
      spreadsheetId: "sheet-1",
      sheetName: "광고요청시트",
      advertiserName: "  광고주   A ",
      landingUrl: "HTTPS://Maps.Google.com/?cid=123 ",
      startDate: "2026-07-27",
    };
    const sameBusinessDataWithDifferentRow = {
      ...base,
      advertiserName: "광고주 A",
      landingUrl: "https://maps.google.com/?cid=123",
    };

    expect(campaignSourceKey(base)).toBe(campaignSourceKey(sameBusinessDataWithDifferentRow));
  });

  it("필수 준비 조건과 캠페인 모집 수에 맞춘 미배정 품질 통과 원고를 요구한다", () => {
    expect(
      evaluateCampaignAutomationGate({
        sourceReady: true,
        googlePlaceLinked: true,
        naverPlaceLinked: true,
        activeReferenceCount: 1,
        evidenceCount: 6,
        evidenceFacetCount: 3,
        unassignedQualityDraftCount: 5,
        campaignPeriodValid: true,
      }),
    ).toEqual({ ready: true, reasons: [] });

    expect(
      evaluateCampaignAutomationGate({
        sourceReady: true,
        googlePlaceLinked: true,
        naverPlaceLinked: true,
        activeReferenceCount: 1,
        evidenceCount: 6,
        evidenceFacetCount: 3,
        unassignedQualityDraftCount: 25,
        campaignPeriodValid: true,
      }),
    ).toEqual({ ready: true, reasons: [] });

    expect(
      evaluateCampaignAutomationGate({
        sourceReady: true,
        googlePlaceLinked: true,
        naverPlaceLinked: true,
        activeReferenceCount: 1,
        evidenceCount: 6,
        evidenceFacetCount: 3,
        unassignedQualityDraftCount: 4,
        campaignPeriodValid: true,
      }),
    ).toEqual({ ready: false, reasons: ["PREPARED_DRAFT_TARGET_NOT_MET"] });

    expect(
      evaluateCampaignAutomationGate({
        sourceReady: true,
        googlePlaceLinked: true,
        naverPlaceLinked: true,
        activeReferenceCount: 1,
        evidenceCount: 6,
        evidenceFacetCount: 3,
        totalQuota: 2,
        unassignedQualityDraftCount: 2,
        campaignPeriodValid: true,
      }),
    ).toEqual({ ready: true, reasons: [] });
  });
});
