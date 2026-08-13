import { redirect } from "next/navigation";
import { AdminFineTuningConsole } from "@/components/admin/AdminFineTuningConsole";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminId } from "@/lib/auth/session";
import { getFineTuningDashboard } from "@/lib/domain/draft-fine-tuning-admin";

export const runtime = "nodejs";

export default async function AdminFineTuningPage({ searchParams }: { searchParams: Promise<{ personaId?: string }> }) {
  if (!(await getAdminId())) redirect("/admin/login");
  const data = await getFineTuningDashboard((await searchParams).personaId);
  return (
    <AdminShell current="fineTuning" title="원고 모델 파인튜닝" description="학습 자료를 검수하고 데이터셋·Vertex 튜닝 작업·후보 모델 평가를 안전하게 운영합니다.">
      <AdminFineTuningConsole initialData={data} personaId={data.scope.personaId} />
    </AdminShell>
  );
}
