import { getReviewerId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { err } from "@/lib/http";
import {
  getPrivateReviewProof,
  privateReviewProofResponse,
  ReviewProofStorageError,
} from "@/lib/review-proof-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요.", 401);

  const { assignmentId } = await params;
  const receipt = await prisma.receipt.findUnique({
    where: { id: assignmentId.trim() },
    select: { reviewerId: true, source: true, reviewProofImageUrl: true },
  });
  if (
    !receipt ||
    receipt.reviewerId !== reviewerId ||
    receipt.source !== "CAMPAIGN_ASSIGNMENT" ||
    !receipt.reviewProofImageUrl
  ) {
    return err("PROOF_NOT_FOUND", "제출한 캡처를 찾을 수 없어요.", 404);
  }

  try {
    const result = await getPrivateReviewProof(receipt.reviewProofImageUrl, req.headers.get("if-none-match"));
    return privateReviewProofResponse(result);
  } catch (e) {
    if (e instanceof ReviewProofStorageError) return err(e.code, e.message, e.status);
    return err("PROOF_STORAGE_UNAVAILABLE", "캡처 저장소에 연결할 수 없어요.", 503);
  }
}
