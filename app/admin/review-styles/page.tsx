import { redirect } from "next/navigation";
import { AdminReviewDraftPersonaLibrary } from "@/components/admin/AdminReviewDraftPersonaLibrary";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminId } from "@/lib/auth/session";
import { listReviewDraftPersonas } from "@/lib/domain/review-draft-personas";

export const runtime = "nodejs";

export default async function AdminReviewStylesPage() {
  if (!(await getAdminId())) redirect("/admin/login");
  const personas = await listReviewDraftPersonas();
  return (
    <AdminShell
      current="reviewStyles"
      title="가상 리뷰어 스타일"
      description="학습용 원고와 참고 링크를 가상 리뷰어별로 관리합니다. 참고 링크는 저장·표시만 하며 서버가 열람하지 않습니다."
    >
      <AdminReviewDraftPersonaLibrary initialPersonas={personas} />
    </AdminShell>
  );
}
