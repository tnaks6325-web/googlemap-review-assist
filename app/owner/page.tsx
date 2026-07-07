import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnerId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getBusinessStats } from "@/lib/domain/stats";
import { Card } from "@/components/ui";
import { LogoutButton } from "@/components/owner/LogoutButton";
import { SubscriptionPanel } from "@/components/owner/SubscriptionPanel";

export const runtime = "nodejs";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-surface p-4">
      <p className="text-[13px] text-ink-weak">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

export default async function OwnerHome() {
  const ownerId = await getOwnerId();
  if (!ownerId) redirect("/owner/login");

  const businesses = await prisma.business.findMany({
    where: { ownerId },
    include: { campaigns: true, subscription: true },
    orderBy: { createdAt: "asc" },
  });
  const data = await Promise.all(
    businesses.map(async (b) => ({ b, stats: await getBusinessStats(b.id) }))
  );

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-ink">사장님 대시보드</h1>
        <div className="flex items-center gap-4">
          <Link href="/owner/new" className="text-sm font-semibold text-brand">
            + 매장 등록
          </Link>
          <LogoutButton />
        </div>
      </header>

      {data.length === 0 && (
        <p className="text-[15px] text-ink-sub">
          등록된 매장이 없어요.{" "}
          <Link href="/owner/new" className="text-brand">
            매장 등록하기
          </Link>
        </p>
      )}

      {data.map(({ b, stats }) => {
        const maxDist = Math.max(1, ...stats.dist);
        return (
          <section key={b.id} className="mb-10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">{b.name}</h2>
              <div className="flex items-center gap-3">
                <a
                  className="text-sm text-ink-weak hover:text-ink-sub"
                  href={`/api/business/${b.id}/feedback/export`}
                >
                  피드백 CSV
                </a>
                <a className="text-sm font-semibold text-brand" href={`/owner/${b.id}`}>
                  관리 →
                </a>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Metric label="총 피드백" value={`${stats.count}건`} />
              <Metric label="평균 별점" value={`${stats.avg.toFixed(1)} ★`} />
              <Metric label="캠페인" value={`${b.campaigns.length}개`} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Metric
                label="최근 30일"
                value={`${stats.comparison.thisCount}건`}
              />
              <Metric
                label="이전 30일 대비"
                value={`${stats.comparison.thisCount - stats.comparison.prevCount >= 0 ? "+" : ""}${stats.comparison.thisCount - stats.comparison.prevCount}`}
              />
              <Metric label="초안 생성률" value={`${stats.draftRate}%`} />
            </div>

            <SubscriptionPanel businessId={b.id} plan={b.subscription?.plan ?? null} />

            <Card>
              <p className="mb-3 text-sm font-semibold text-ink-weak">별점 추이 (최근 8주)</p>
              <div className="flex items-end gap-1.5" style={{ height: 96 }}>
                {stats.trend.map((t, i) => {
                  const maxCount = Math.max(1, ...stats.trend.map((x) => x.count));
                  return (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className="w-full rounded-t bg-brand"
                          style={{ height: `${Math.round((t.count / maxCount) * 72)}px` }}
                          title={`${t.count}건 · 평균 ${t.avg}★`}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-ink-weak">
                        {t.avg ? t.avg.toFixed(1) : "-"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1 text-right text-[11px] text-ink-weak">막대=건수, 숫자=평균 별점</p>
            </Card>

            <Card>
              <p className="mb-3 text-sm font-semibold text-ink-weak">별점 분포</p>
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const c = stats.dist[star - 1];
                  return (
                    <div key={star} className="flex items-center gap-2 text-sm">
                      <span className="w-8 text-ink-sub">{star}★</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${Math.round((c / maxDist) * 100)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right tabular-nums text-ink-sub">{c}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <p className="mb-3 text-sm font-semibold text-ink-weak">인기 메뉴</p>
              {stats.topMenus.length ? (
                <ul className="space-y-1">
                  {stats.topMenus.map((m) => (
                    <li key={m.name} className="flex justify-between text-sm">
                      <span className="text-ink">{m.name}</span>
                      <span className="tabular-nums text-ink-sub">{m.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-weak">아직 데이터가 없어요</p>
              )}
            </Card>

            <Card>
              <p className="mb-3 text-sm font-semibold text-ink-weak">불만 키워드 (별점 3 이하 소감)</p>
              {stats.complaintKeywords.length ? (
                <div className="flex flex-wrap gap-2">
                  {stats.complaintKeywords.map((k) => (
                    <span
                      key={k.word}
                      className="rounded-full bg-canvas px-3 py-1 text-sm text-ink-sub"
                    >
                      {k.word} <span className="tabular-nums text-ink-weak">{k.count}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-weak">아직 데이터가 없어요</p>
              )}
            </Card>

            <Card>
              <p className="mb-3 text-sm font-semibold text-ink-weak">최근 피드백</p>
              {stats.recent.length ? (
                <ul className="space-y-2">
                  {stats.recent.map((r) => (
                    <li key={r.id} className="text-sm">
                      <span className="text-brand">{"★".repeat(r.rating)}</span>{" "}
                      <span className="text-ink">{r.comment || "(소감 없음)"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-weak">아직 피드백이 없어요</p>
              )}
            </Card>
          </section>
        );
      })}
    </main>
  );
}
