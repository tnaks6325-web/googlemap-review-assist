import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { processOperationalJobs } from "@/lib/domain/operational-jobs";

describe("운영 작업 lease 복구", () => {
  it("오래 잠긴 PROCESSING 작업을 RETRY로 회수해 다시 처리한다", async () => {
    const job = await prisma.operationalJob.create({
      data: {
        type: "UNKNOWN_FOR_RECOVERY_TEST",
        dedupeKey: `recovery-${Date.now()}`,
        payloadJson: "{}",
        status: "PROCESSING",
        lockedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    const summary = await processOperationalJobs(10);
    const updated = await prisma.operationalJob.findUniqueOrThrow({ where: { id: job.id } });

    expect(summary.claimed).toBeGreaterThanOrEqual(1);
    expect(updated.status).toBe("COMPLETED");
    expect(updated.completedAt).toBeInstanceOf(Date);
  });
});
