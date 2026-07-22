import { describe, expect, it, vi } from "vitest";
import { copyReviewDraftToClipboard } from "@/components/flow/ReviewFlow";

describe("copyReviewDraftToClipboard", () => {
  it("copies the assigned draft and reports success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(
      copyReviewDraftToClipboard("배정된 리뷰 원고", { writeText }),
    ).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("배정된 리뷰 원고");
  });

  it("reports failure when the browser blocks clipboard access", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("not allowed"));

    await expect(
      copyReviewDraftToClipboard("배정된 리뷰 원고", { writeText }),
    ).resolves.toBe(false);
  });

  it("does not write an empty draft", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(copyReviewDraftToClipboard("   ", { writeText })).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});
