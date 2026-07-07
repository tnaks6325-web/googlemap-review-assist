import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLogout } from "@/components/admin/AdminLogout";
import { SettlementQueue } from "@/components/admin/SettlementQueue";
import { Card } from "@/components/ui";
import { getAdminId } from "@/lib/auth/session";
import { getAbuseSignals, getPendingSettlements } from "@/lib/domain/admin";

export const runtime = "nodejs";

export default async function AdminHome() {
  const adminId = await getAdminId();
  if (!adminId) redirect("/admin/login");

  const [pending, abuse] = await Promise.all([getPendingSettlements(), getAbuseSignals()]);

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-ink">관리자 백오피스</h1>
          <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
            <Link href="/admin/campaigns" className="text-brand">
              캠페인 운영
            </Link>
            <Link href="/admin/reviewers" className="text-brand">
              리뷰어 관리
            </Link>
          </div>
        </div>
        <AdminLogout />
      </header>

      <section className="mb-8 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink-weak">
            정산 대기 ({pending.length})
          </h2>
          <Link href="/admin/reviewers" className="text-sm font-semibold text-brand">
            일괄 처리
          </Link>
        </div>
        <SettlementQueue items={pending} />
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
    </main>
  );
}
