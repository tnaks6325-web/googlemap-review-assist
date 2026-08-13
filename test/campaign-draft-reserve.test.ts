import { describe, expect, it } from "vitest";
import { campaignPreparedDraftReserveTarget } from "@/lib/domain/campaign-draft-reserve";

describe("캠페인 사전 원고 여유분 목표", () => {
  it("코드 수량에 20% 여분을 더하되, 여분은 최소 세 건을 준비한다", () => {
    expect(campaignPreparedDraftReserveTarget(1)).toBe(4);
    expect(campaignPreparedDraftReserveTarget(2)).toBe(5);
    expect(campaignPreparedDraftReserveTarget(5)).toBe(8);
    expect(campaignPreparedDraftReserveTarget(25)).toBe(30);
    expect(campaignPreparedDraftReserveTarget(50)).toBe(60);
    expect(campaignPreparedDraftReserveTarget(null)).toBe(8);
  });
});
