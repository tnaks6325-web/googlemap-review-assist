import { describe, expect, it } from "vitest";
import { fillPreparedDraftPool } from "@/lib/domain/campaign-prepared-draft-pool";

describe("미배정 원고 풀 자동 충전", () => {
  it("부족한 수량을 목표 25개까지 채우고, 도달하면 더 생성하지 않는다", async () => {
    let count = 18;
    const generated: number[] = [];

    const result = await fillPreparedDraftPool("campaign-1", {
      target: 25,
      countUnassignedQualityDrafts: async () => count,
      generateRound: async () => {
        generated.push(count);
        count = Math.min(25, count + 4);
      },
    });

    expect(result).toMatchObject({ target: 25, initialCount: 18, finalCount: 25, reachedTarget: true });
    expect(generated).toEqual([18, 22]);
  });

  it("연속 세 번 수량이 늘지 않으면 무한 생성하지 않고 중단한다", async () => {
    const result = await fillPreparedDraftPool("campaign-1", {
      countUnassignedQualityDrafts: async () => 4,
      generateRound: async () => undefined,
    });

    expect(result).toMatchObject({ initialCount: 4, finalCount: 4, reachedTarget: false, stagnantRounds: 3 });
    expect(result.rounds).toBe(3);
  });
});
