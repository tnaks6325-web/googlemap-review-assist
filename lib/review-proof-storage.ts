import { del, get, put, type GetBlobResult } from "@vercel/blob";

export const MAX_REVIEW_PROOF_BYTES = 4 * 1024 * 1024;

const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ReviewProofMimeType = keyof typeof MIME_EXTENSIONS;

export class ReviewProofStorageError extends Error {
  constructor(
    public readonly code:
      | "INVALID_FILE_TYPE"
      | "FILE_TOO_LARGE"
      | "INVALID_IMAGE"
      | "INVALID_PROOF_URL",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ReviewProofStorageError";
  }
}

function sniffImageMimeType(bytes: Uint8Array): ReviewProofMimeType | null {
  if (bytes.length < 8) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function isReviewProofMimeType(value: string): value is ReviewProofMimeType {
  return value in MIME_EXTENSIONS;
}

export function validateReviewProofImage(
  file: Pick<File, "size" | "type">,
  bytes: Uint8Array,
): { extension: string; mimeType: ReviewProofMimeType } {
  if (!isReviewProofMimeType(file.type)) {
    throw new ReviewProofStorageError("INVALID_FILE_TYPE", "JPG, PNG, WEBP 이미지만 업로드할 수 있어요.", 422);
  }
  if (file.size <= 0 || file.size > MAX_REVIEW_PROOF_BYTES || bytes.length > MAX_REVIEW_PROOF_BYTES) {
    throw new ReviewProofStorageError("FILE_TOO_LARGE", "캡처 이미지는 4MB 이하로 업로드해 주세요.", 422);
  }

  const detectedMimeType = sniffImageMimeType(bytes);
  if (!detectedMimeType || detectedMimeType !== file.type) {
    throw new ReviewProofStorageError("INVALID_IMAGE", "이미지 파일 형식을 확인할 수 없어요.", 422);
  }

  return { extension: MIME_EXTENSIONS[file.type], mimeType: file.type };
}

export async function uploadReviewProof({
  assignmentId,
  bytes,
  mimeType,
}: {
  assignmentId: string;
  bytes: Uint8Array;
  mimeType: ReviewProofMimeType;
}) {
  const safeAssignmentId = assignmentId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "assignment";
  const extension = MIME_EXTENSIONS[mimeType];
  const blob = await put(`review-proofs/${safeAssignmentId}/proof.${extension}`, Buffer.from(bytes), {
    access: "private",
    addRandomSuffix: true,
    contentType: mimeType,
    cacheControlMaxAge: 60,
  });
  return blob.url;
}

export function isPrivateReviewProofUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".private.blob.vercel-storage.com") &&
      url.pathname.startsWith("/review-proofs/")
    );
  } catch {
    return false;
  }
}

export async function deleteReviewProof(url: string) {
  if (!isPrivateReviewProofUrl(url)) return;
  await del(url);
}

export async function getPrivateReviewProof(url: string, ifNoneMatch?: string | null): Promise<GetBlobResult> {
  if (!isPrivateReviewProofUrl(url)) {
    throw new ReviewProofStorageError("INVALID_PROOF_URL", "저장된 캡처를 찾을 수 없어요.", 404);
  }
  const result = await get(url, { access: "private", ifNoneMatch: ifNoneMatch ?? undefined });
  if (!result) {
    throw new ReviewProofStorageError("INVALID_PROOF_URL", "저장된 캡처를 찾을 수 없어요.", 404);
  }
  return result;
}

export function privateReviewProofResponse(result: GetBlobResult) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    ETag: result.blob.etag,
    "X-Content-Type-Options": "nosniff",
  });

  if (result.statusCode === 304) {
    return new Response(null, { status: 304, headers });
  }

  headers.set("Content-Type", result.blob.contentType || "application/octet-stream");
  headers.set("Content-Disposition", "inline");
  return new Response(result.stream, { status: 200, headers });
}
