import { describe, expect, it } from "vitest";
import { campaignPreparedDraftReserveTarget } from "@/lib/domain/campaign-draft-reserve";

describe("캠페인 사전 원고 여유분 목표", () => {
  it("모집 인원이 적으면 그 수만큼, 그 외에는 최대 다섯 건만 준비한다", () => {
    expect(campaignPreparedDraftReserveTarget(2)).toBe(2);
    expect(campaignPreparedDraftReserveTarget(5)).toBe(5);
    expect(campaignPreparedDraftReserveTarget(25)).toBe(5);
    expect(campaignPreparedDraftReserveTarget(null)).toBe(5);
  });
});
