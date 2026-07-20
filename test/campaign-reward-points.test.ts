import { describe, expect, it } from "vitest";
import {
  MAX_CAMPAIGN_REWARD_POINTS,
  MIN_CAMPAIGN_REWARD_POINTS,
  parseCampaignRewardPoints,
} from "@/lib/domain/campaign-reward-points";

describe("campaign reward points validation", () => {
  it("accepts integer points within the supported range", () => {
    expect(parseCampaignRewardPoints(500)).toBe(500);
    expect(parseCampaignRewardPoints(MIN_CAMPAIGN_REWARD_POINTS)).toBe(
      MIN_CAMPAIGN_REWARD_POINTS,
    );
    expect(parseCampaignRewardPoints(MAX_CAMPAIGN_REWARD_POINTS)).toBe(
      MAX_CAMPAIGN_REWARD_POINTS,
    );
  });

  it("rejects non-integers and values outside the supported range", () => {
    expect(parseCampaignRewardPoints("500")).toBeNull();
    expect(parseCampaignRewardPoints(500.5)).toBeNull();
    expect(parseCampaignRewardPoints(MIN_CAMPAIGN_REWARD_POINTS - 1)).toBeNull();
    expect(parseCampaignRewardPoints(MAX_CAMPAIGN_REWARD_POINTS + 1)).toBeNull();
  });
});
