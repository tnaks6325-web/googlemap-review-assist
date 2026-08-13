import { redirect } from "next/navigation";
import { AdminSettlementBulkActions } from "@/components/admin/AdminSettlementBulkActions";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui";
import { getAdminId } from "@/lib/auth/session";
import { getAbuseSignals, getPendingSettlements } from "@/lib/domain/admin";

export const runtime = "nodejs";

export default async function AdminHome() {
  const adminId = await getAdminId();
  if (!adminId) redirect("/admin/login");

  const [pending, abuse] = await Promise.all([getPendingSettlements(), getAbuseSignals()]);

  return (
    <AdminShell
      current="overview"
      title="운영 현황"
      description="정산 대기와 참여 이상 신호를 한 화면에서 확인합니다."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink-weak">하나은행 지급 대기 ({pending.length})</h2>
            </div>
          <AdminSettlementBulkActions items={pending} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-weak">어뷰징 신호</h2>
          <Card>
            <p className="mb-2 text-sm font-semibold text-ink-weak">매장 집중 참여 상위</p>
            {abuse.concentration.length ? (
              <ul className="space-y-1">
                {abuse.concentration.map((item, idx) => (
                  <li key={idx} className="flex justify-between gap-3 text-sm">
                    <span className="text-ink">
                      {item.phone} · {item.business}
                    </span>
                    <span className="tabular-nums text-ink-sub">{item.count}건</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-weak">데이터 없음</p>
            )}
          </Card>
          <Card>
            <p className="mb-2 text-sm font-semibold text-ink-weak">고액 적립자 상위</p>
            {abuse.topEarners.length ? (
              <ul className="space-y-1">
                {abuse.topEarners.map((item, idx) => (
                  <li key={idx} className="flex justify-between text-sm">
                    <span className="text-ink">{item.phone}</span>
                    <span className="tabular-nums text-ink-sub">
                      {item.total.toLocaleString("ko-KR")}P
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-weak">데이터 없음</p>
            )}
          </Card>
        </section>
      </div>
    </AdminShell>
  );
}
