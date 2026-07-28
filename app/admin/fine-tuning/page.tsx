import { redirect } from "next/navigation";
import { AdminFineTuningConsole } from "@/components/admin/AdminFineTuningConsole";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminId } from "@/lib/auth/session";
import { getFineTuningDashboard } from "@/lib/domain/draft-fine-tuning-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function FineTuningPage() {
  if (!(await getAdminId())) redirect("/admin/login");
  return (
    <AdminShell current="fine-tuning" title="원고 생성 모델 학습" description="검증된 원고를 학습 자료로 쌓고, Gemini 파인튜닝부터 평가·운영 적용까지 관리합니다." wideContent>
      <AdminFineTuningConsole initialData={await getFineTuningDashboard()} />
    </AdminShell>
  );
}
