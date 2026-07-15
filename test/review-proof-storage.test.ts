import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));

vi.mock("@vercel/blob", () => ({ get, put }));

import {
  MAX_REVIEW_PROOF_BYTES,
  ReviewProofStorageError,
  isPrivateReviewProofUrl,
  uploadReviewProof,
  validateReviewProofImage,
} from "@/lib/review-proof-storage";

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe("private review proof storage", () => {
  beforeEach(() => {
    put.mockReset();
  });

  it("accepts a supported image only when its declared MIME type matches its signature", () => {
    expect(validateReviewProofImage({ type: "image/png", size: pngBytes.length }, pngBytes)).toEqual({
      extension: "png",
      mimeType: "image/png",
    });

    expect(() => validateReviewProofImage({ type: "image/jpeg", size: pngBytes.length }, pngBytes)).toThrow(
      ReviewProofStorageError,
    );
  });

  it("rejects screenshots above the server upload limit", () => {
    const bytes = new Uint8Array(MAX_REVIEW_PROOF_BYTES + 1);
    expect(() => validateReviewProofImage({ type: "image/png", size: bytes.length }, bytes)).toThrow(
      /4MB/,
    );
  });

  it("stores proof images as private blobs with an unguessable pathname", async () => {
    put.mockResolvedValue({
      url: "https://store.private.blob.vercel-storage.com/review-proofs/assignment/proof-random.png",
    });

    const url = await uploadReviewProof({
      assignmentId: "assignment_123",
      bytes: pngBytes,
      mimeType: "image/png",
    });

    expect(url).toContain(".private.blob.vercel-storage.com/");
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^review-proofs\/assignment_123\/proof\.png$/),
      expect.any(Buffer),
      expect.objectContaining({
        access: "private",
        addRandomSuffix: true,
        contentType: "image/png",
      }),
    );
  });

  it("only accepts private review-proof Blob URLs for proxying", () => {
    expect(isPrivateReviewProofUrl("https://store.private.blob.vercel-storage.com/review-proofs/a/proof.png")).toBe(true);
    expect(isPrivateReviewProofUrl("https://store.public.blob.vercel-storage.com/review-proofs/a/proof.png")).toBe(false);
    expect(isPrivateReviewProofUrl("https://example.com/review-proofs/a/proof.png")).toBe(false);
  });
});
