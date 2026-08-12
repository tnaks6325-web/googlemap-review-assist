import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { ReviewProofQueue } from "@/components/admin/ReviewProofQueue";
import { getAdminId } from "@/lib/auth/session";
import { getPendingReviewProofs } from "@/lib/domain/admin";

export const runtime = "nodejs";

export default async function AdminReviewProofsPage() {
  const adminId = await getAdminId();
  if (!adminId) redirect("/admin/login");
  const reviewProofs = await getPendingReviewProofs();
  return <AdminShell current="reviewProofs" title="리뷰 캡처 검수" description="제출된 리뷰 캡처를 확인하고 승인 또는 반려합니다."><ReviewProofQueue items={reviewProofs.map((item) => ({ ...item, submittedAt: item.submittedAt.toISOString() }))} /></AdminShell>;
}
