import { redirect } from "next/navigation";
import { AdminErrorLogList, type AdminErrorLogRow } from "@/components/admin/AdminErrorLogList";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui";
import { getAdminId } from "@/lib/auth/session";
import {
  getOperationalErrorSummary,
  listOperationalErrors,
  type ErrorSeverity,
  type ErrorSource,
} from "@/lib/error-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const severities = new Set(["ALL", "WARNING", "ERROR", "CRITICAL"]);
const sources = new Set(["ALL", "SERVER", "BROWSER", "JOB", "INTEGRATION"]);
const statuses = new Set(["ALL", "OPEN", "RESOLVED"]);

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await getAdminId())) redirect("/admin/login");
  const query = await searchParams;
  const severityValue = typeof query.severity === "string" ? query.severity : "ALL";
  const sourceValue = typeof query.source === "string" ? query.source : "ALL";
  const statusValue = typeof query.status === "string" ? query.status : "OPEN";
  const severity = severities.has(severityValue) ? severityValue : "ALL";
  const source = sources.has(sourceValue) ? sourceValue : "ALL";
  const status = statuses.has(statusValue) ? statusValue : "OPEN";

  const [summary, errors] = await Promise.all([
    getOperationalErrorSummary(),
    listOperationalErrors({
      severity: severity as ErrorSeverity | "ALL",
      source: source as ErrorSource | "ALL",
      status: status as "OPEN" | "RESOLVED" | "ALL",
    }),
  ]);
  const items: AdminErrorLogRow[] = errors.map((item) => ({
    ...item,
    firstOccurredAt: item.firstOccurredAt.toISOString(),
    lastOccurredAt: item.lastOccurredAt.toISOString(),
  }));

  return (
    <AdminShell
      current="errors"
      title="오류 로그"
      description="어느 업무의 어떤 단계가 왜 실패했는지 확인하고 필요한 조치를 진행합니다."
    >
      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <Metric label="미확인 오류" value={summary.open} warning={summary.open > 0} />
        <Metric label="오늘 발생" value={summary.today} />
        <Metric label="치명적 오류" value={summary.critical} critical={summary.critical > 0} />
      </section>

      <form className="mb-5 grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-3 lg:max-w-3xl">
        <Filter label="심각도" name="severity" value={severity}>
          <option value="ALL">전체 심각도</option>
          <option value="WARNING">경고</option>
          <option value="ERROR">오류</option>
          <option value="CRITICAL">치명적</option>
        </Filter>
        <Filter label="발생 위치" name="source" value={source}>
          <option value="ALL">전체 위치</option>
          <option value="SERVER">서버</option>
          <option value="BROWSER">브라우저</option>
          <option value="JOB">배치</option>
          <option value="INTEGRATION">외부 연동</option>
        </Filter>
        <Filter label="상태" name="status" value={status}>
          <option value="OPEN">미확인</option>
          <option value="RESOLVED">확인 완료</option>
          <option value="ALL">전체 상태</option>
        </Filter>
        <button
          type="submit"
          className="h-10 rounded-[9px] bg-brand px-4 text-sm font-bold text-white sm:col-span-3 sm:justify-self-end"
        >
          조건 적용
        </button>
      </form>

      <AdminErrorLogList items={items} />
    </AdminShell>
  );
}

function Metric({
  label,
  value,
  warning = false,
  critical = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
  critical?: boolean;
}) {
  return (
    <Card className={critical ? "border-red-200 bg-red-50" : warning ? "border-amber-200 bg-amber-50" : ""}>
      <p className="text-xs text-ink-weak">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${critical ? "text-red-700" : warning ? "text-amber-800" : "text-ink"}`}>
        {value.toLocaleString("ko-KR")}건
      </p>
    </Card>
  );
}

function Filter({
  label,
  name,
  value,
  children,
}: {
  label: string;
  name: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs font-semibold text-ink-weak">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="mt-1 block h-10 w-full rounded-[9px] border border-line bg-surface px-3 text-sm text-ink"
      >
        {children}
      </select>
    </label>
  );
}
