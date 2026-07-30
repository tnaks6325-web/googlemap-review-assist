import { describe, expect, it, vi } from "vitest";
import {
  buildGoogleMapsSearchQuery,
  copyReviewDraftToClipboard,
} from "@/components/flow/ReviewFlow";

describe("buildGoogleMapsSearchQuery", () => {
  it("combines the place name and address for the reviewer to paste into Google Maps", () => {
    expect(
      buildGoogleMapsSearchQuery("  로우파이브안국  ", "  서울 종로구 재동 60  "),
    ).toBe("로우파이브안국 서울 종로구 재동 60");
  });

  it("uses only the place name when the campaign has no address", () => {
    expect(buildGoogleMapsSearchQuery("로우파이브안국", null)).toBe("로우파이브안국");
  });
});

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
