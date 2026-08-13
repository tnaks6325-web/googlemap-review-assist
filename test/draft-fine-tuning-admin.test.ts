import { describe, expect, it } from "vitest";
import { DraftFineTuningError } from "@/lib/domain/draft-fine-tuning";
import { trainingExampleStatusUpdate } from "@/lib/domain/draft-fine-tuning-admin";

describe("fine-tuning administrator material review", () => {
  it("records approver and approval time only for approved material", () => {
    expect(trainingExampleStatusUpdate("APPROVED", "admin-1")).toEqual({
      status: "APPROVED", approvedByAdminId: "admin-1", approvedAt: expect.any(Date),
    });
    expect(trainingExampleStatusUpdate("REJECTED", "admin-1")).toEqual({
      status: "REJECTED", approvedByAdminId: null, approvedAt: null,
    });
  });

  it("rejects a status outside the July 29 review workflow", () => {
    expect(() => trainingExampleStatusUpdate("ACTIVE", "admin-1"))
      .toThrowError(expect.objectContaining({ code: "TRAINING_STATUS_INVALID" } satisfies Partial<DraftFineTuningError>));
  });
});
