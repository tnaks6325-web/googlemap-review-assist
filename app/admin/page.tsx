import { redirect } from "next/navigation";
import { getAdminId } from "@/lib/auth/session";
import { getPendingSettlements, getAbuseSignals } from "@/lib/domain/admin";
import { Card } from "@/components/ui";
import { SettlementQueue } from "@/components/admin/SettlementQueue";
import { AdminLogout } from "@/components/admin/AdminLogout";

export const runtime = "nodejs";

export default async function AdminHome() {
  const adminId = await getAdminId();
  if (!adminId) redirect("/admin/login");

  const [pending, abuse] = await Promise.all([getPendingSettlements(), getAbuseSignals()]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-ink">관리자 백오피스</h1>
        <AdminLogout />
      </header>

      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold text-ink-weak">정산 승인 대기 ({pending.length})</h2>
        <SettlementQueue items={pending} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-weak">어뷰징 신호</h2>
        <Card>
          <p className="mb-2 text-sm font-semibold text-ink-weak">매장 집중 리뷰어 (영수증 수 상위)</p>
          {abuse.concentration.length ? (
            <ul className="space-y-1">
              {abuse.concentration.map((c, idx) => (
                <li key={idx} className="flex justify-between text-sm">
                  <span className="text-ink">{c.phone} · {c.business}</span>
                  <span className="tabular-nums text-ink-sub">{c.count}건</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-weak">데이터 없음</p>
          )}
        </Card>
        <Card>
          <p className="mb-2 text-sm font-semibold text-ink-weak">고액 적립자 (EARN 합계 상위)</p>
          {abuse.topEarners.length ? (
            <ul className="space-y-1">
              {abuse.topEarners.map((e, idx) => (
                <li key={idx} className="flex justify-between text-sm">
                  <span className="text-ink">{e.phone}</span>
                  <span className="tabular-nums text-ink-sub">{e.total.toLocaleString("ko-KR")}P</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-weak">데이터 없음</p>
          )}
        </Card>
      </section>
    </main>
  );
}
