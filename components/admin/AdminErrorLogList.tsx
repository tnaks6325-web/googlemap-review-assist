"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AdminErrorLogRow {
  id: string;
  severity: string;
  source: string;
  workflow: string;
  stage: string;
  code: string;
  title: string;
  situation: string;
  cause: string;
  impact: string;
  action: string;
  technicalName: string | null;
  technicalMessage: string | null;
  digest: string | null;
  route: string | null;
  method: string | null;
  entityType: string | null;
  entityId: string | null;
  metadataJson: string | null;
  status: string;
  occurrenceCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
}

const severityLabel: Record<string, string> = {
  WARNING: "경고",
  ERROR: "오류",
  CRITICAL: "치명적",
};

const sourceLabel: Record<string, string> = {
  SERVER: "서버",
  BROWSER: "브라우저",
  JOB: "배치",
  INTEGRATION: "외부 연동",
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminErrorLogList({ items }: { items: AdminErrorLogRow[] }) {
  if (!items.length) {
    return (
      <div className="rounded-card border border-line bg-surface p-10 text-center text-sm text-ink-weak">
        조건에 맞는 오류 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ErrorLogItem key={item.id} item={item} />
      ))}
    </div>
  );
}

function ErrorLogItem({ item }: { item: AdminErrorLogRow }) {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [message, setMessage] = useState("");
  const severityClass =
    item.severity === "CRITICAL"
      ? "border-red-200 bg-red-50 text-red-700"
      : item.severity === "ERROR"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-blue-200 bg-blue-50 text-blue-700";

  async function resolveItem() {
    setResolving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/error-logs/${item.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resolve" }),
      });
      if (!response.ok) throw new Error("resolve failed");
      router.refresh();
    } catch {
      setMessage("확인 완료 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setResolving(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-card border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${severityClass}`}>
              {severityLabel[item.severity] ?? item.severity}
            </span>
            <span className="rounded-full bg-canvas px-2 py-1 text-[11px] font-semibold text-ink-sub">
              {sourceLabel[item.source] ?? item.source}
            </span>
            <span className="text-xs font-semibold text-brand">
              {item.workflow} · {item.stage}
            </span>
          </div>
          <h2 className="mt-3 text-base font-bold text-ink">{item.title}</h2>
          <p className="mt-2 text-sm leading-6 text-ink-sub">
            {item.workflow} 업무에서 {item.stage} 단계가 완료되지 않았습니다.
          </p>
          <p className="mt-2 text-xs text-ink-weak">
            최근 {dateTime(item.lastOccurredAt)} · 최초 {dateTime(item.firstOccurredAt)} · 총{" "}
            {item.occurrenceCount.toLocaleString("ko-KR")}회
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              item.status === "OPEN" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {item.status === "OPEN" ? "미확인" : "확인 완료"}
          </span>
          {item.status === "OPEN" ? (
            <button
              type="button"
              onClick={resolveItem}
              disabled={resolving}
              className="rounded-[9px] bg-brand-tint px-3 py-2 text-xs font-bold text-brand disabled:opacity-50"
            >
              {resolving ? "처리 중" : "확인 완료"}
            </button>
          ) : null}
        </div>
      </div>

      <details className="border-t border-line">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-ink-sub">
          원인·영향·조치 자세히 보기
        </summary>
        <div className="grid gap-3 border-t border-line bg-canvas/60 p-5 lg:grid-cols-2">
          <Detail title="발생 상황" text={item.situation} />
          <Detail title="원인" text={item.cause} />
          <Detail title="업무 영향" text={item.impact} />
          <Detail title="권장 조치" text={item.action} />
          <div className="lg:col-span-2">
            <p className="text-xs font-bold text-ink-weak">기술 정보</p>
            <div className="mt-1 break-words rounded-[9px] border border-line bg-surface p-3 font-mono text-xs leading-5 text-ink-sub">
              <p>{item.code}</p>
              {item.technicalName || item.technicalMessage ? (
                <p>{[item.technicalName, item.technicalMessage].filter(Boolean).join(": ")}</p>
              ) : null}
              {item.route ? <p>{[item.method, item.route].filter(Boolean).join(" ")}</p> : null}
              {item.digest ? <p>digest: {item.digest}</p> : null}
              {item.entityType && item.entityId ? <p>{item.entityType}: {item.entityId}</p> : null}
            </div>
          </div>
        </div>
      </details>
      {message ? <p className="px-5 pb-4 text-xs font-semibold text-red-600">{message}</p> : null}
    </article>
  );
}

function Detail({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[9px] border border-line bg-surface p-4">
      <p className="text-xs font-bold text-ink-weak">{title}</p>
      <p className="mt-1 text-sm leading-6 text-ink-sub">{text}</p>
    </div>
  );
}
