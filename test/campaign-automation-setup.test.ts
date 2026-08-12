import { describe, expect, it, vi } from "vitest";
import { runCampaignAutomationSetup } from "@/lib/domain/campaign-automation-setup";

describe("캠페인 자동 세팅 순서", () => {
  it("네이버 Place가 확정되지 않으면 잘못 연결하지 않고 수동 확인으로 끝낸다", async () => {
    const collectReferences = vi.fn();
    const result = await runCampaignAutomationSetup("campaign-1", {
      linkNaverPlace: async () => false,
      collectReferences,
      extractEvidence: async () => true,
      fillPreparedDraftPool: async () => true,
      activateCampaign: async () => undefined,
    });

    expect(result).toEqual({ status: "NEEDS_REVIEW", reason: "NAVER_PLACE" });
    expect(collectReferences).not.toHaveBeenCalled();
  });

  it("참고자료, 사실 카드, 원고 25개가 모두 준비된 경우에만 활성화한다", async () => {
    const activateCampaign = vi.fn(async () => undefined);
    const result = await runCampaignAutomationSetup("campaign-1", {
      linkNaverPlace: async () => true,
      collectReferences: async () => true,
      extractEvidence: async () => true,
      fillPreparedDraftPool: async () => true,
      activateCampaign,
    });

    expect(result).toEqual({ status: "READY" });
    expect(activateCampaign).toHaveBeenCalledWith("campaign-1");
  });

  it("원고 풀이 25개에 도달하지 않으면 공개하지 않는다", async () => {
    const activateCampaign = vi.fn(async () => undefined);
    const result = await runCampaignAutomationSetup("campaign-1", {
      linkNaverPlace: async () => true,
      collectReferences: async () => true,
      extractEvidence: async () => true,
      fillPreparedDraftPool: async () => false,
      activateCampaign,
    });

    expect(result).toEqual({ status: "NEEDS_REVIEW", reason: "DRAFT_QUALITY" });
    expect(activateCampaign).not.toHaveBeenCalled();
  });
});
