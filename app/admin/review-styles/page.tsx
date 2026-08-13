import { redirect } from "next/navigation";
import { AdminReviewDraftPersonaLibrary } from "@/components/admin/AdminReviewDraftPersonaLibrary";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminId } from "@/lib/auth/session";
import { listReviewDraftPersonas } from "@/lib/domain/review-draft-personas";

export const runtime = "nodejs";

export default async function AdminReviewStylesPage({ searchParams }: { searchParams: Promise<{ advancedPersonaId?: string }> }) {
  if (!(await getAdminId())) redirect("/admin/login");
  const personas = await listReviewDraftPersonas();
  const advancedPersonaId = (await searchParams).advancedPersonaId ?? null;
  return (
    <AdminShell
      current="reviewStyles"
      title="가상 리뷰어 관리"
      description="캐릭터별 기본 스타일 원고를 관리하고, 필요할 때만 카드 안에서 고급 Vertex 튜닝을 진행합니다."
    >
      <AdminReviewDraftPersonaLibrary initialPersonas={personas} initialAdvancedPersonaId={advancedPersonaId} />
    </AdminShell>
  );
}
