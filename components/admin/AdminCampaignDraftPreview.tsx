"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DraftStatus = "UNASSIGNED" | "QUALITY_EXCLUDED" | "ASSIGNED";

interface PreparedDraftMetrics {
  totalCount: number;
  unassignedCount: number;
  qualityExcludedCount: number;
  assignedCount: number;
  batchCount: number;
}

interface PreparedDraftHistory {
  campaignId: string;
  hasMore: boolean;
  metrics: PreparedDraftMetrics;
  items: Array<{
    id: string;
    batchId: string;
    slot: number;
    styleId: string;
    toneLabel: string;
    structureLabel: string;
    text: string;
    evidenceIds: string[];
    maxSimilarity: number;
    qualityPassed: boolean;
    status: DraftStatus;
    assignmentId: string | null;
    generatedAt: string;
    provider: string;
    model: string;
    promptVersion: string;
  }>;
}

interface ErrorResult {
  error?: { message?: string };
}

type DraftGenerationStreamEvent =
  | { type: "progress"; generatedCount: number; targetCount: number }
  | { type: "complete" }
  | { type: "error"; message: string };

export async function consumeDraftGenerationStream(
  response: Response,
  onProgress: (generatedCount: number, targetCount: number) => void,
) {
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as ErrorResult | null;
    throw new Error(data?.error?.message || "원고를 사전 생성하지 못했습니다.");
  }
  if (!response.body) throw new Error("원고 생성 진행 상태를 확인하지 못했습니다.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as DraftGenerationStreamEvent;
    if (event.type === "progress") {
      onProgress(event.generatedCount, event.targetCount);
    } else if (event.type === "error") {
      throw new Error(event.message);
    } else {
      completed = true;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
    if (done) break;
  }
  consumeLine(buffer);
  if (!completed) throw new Error("원고 생성이 완료되기 전에 연결이 종료되었습니다.");
}

export function DraftGenerationProgress({
  current,
  target,
}: {
  current: number;
  target: number;
}) {
  const safeTarget = Math.max(1, target);
  const safeCurrent = Math.min(Math.max(0, current), safeTarget);
  const percent = (safeCurrent / safeTarget) * 100;
  return (
    <span
      role="progressbar"
      aria-label="원고 생성 진행률"
      aria-valuemin={0}
      aria-valuemax={safeTarget}
      aria-valuenow={safeCurrent}
      className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[8px]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-brand/20 transition-[width] duration-300 ease-out"
        style={{ width: `${percent}%` }}
      />
      <span className="relative z-10 tabular-nums">
        원고생성 {safeCurrent}/{safeTarget}
      </span>
    </span>
  );
}

const FILTERS: Array<{ status: DraftStatus; label: string; metric: keyof PreparedDraftMetrics }> = [
  { status: "UNASSIGNED", label: "미배정", metric: "unassignedCount" },
  { status: "QUALITY_EXCLUDED", label: "품질 제외", metric: "qualityExcludedCount" },
  { status: "ASSIGNED", label: "배정 완료", metric: "assignedCount" },
];

export function AdminCampaignDraftPreview({
  campaignId,
  businessName,
  initialMetrics = {
    totalCount: 0,
    unassignedCount: 0,
    qualityExcludedCount: 0,
    assignedCount: 0,
    batchCount: 0,
  },
}: {
  campaignId: string;
  businessName: string;
  initialMetrics?: PreparedDraftMetrics;
}) {
  const [busy, setBusy] = useState<"loading" | "generating" | null>(null);
  const [history, setHistory] = useState<PreparedDraftHistory | null>(null);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [filter, setFilter] = useState<DraftStatus>("UNASSIGNED");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [open]);

  const loadHistory = async () => {
    setBusy("loading");
    setError(null);
    try {
      const response = await fetch(`/api/admin/campaigns/${campaignId}/draft-preview`);
      const data = (await response.json().catch(() => null)) as
        | (PreparedDraftHistory & ErrorResult)
        | null;
      if (!response.ok || !data?.metrics || !Array.isArray(data.items)) {
        throw new Error(data?.error?.message || "저장된 원고를 불러오지 못했습니다.");
      }
      setHistory(data);
      setMetrics(data.metrics);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장된 원고를 불러오지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const openHistory = () => {
    setOpen(true);
    void loadHistory();
  };

  const generate = async () => {
    setBusy("generating");
    setGenerationProgress(0);
    setError(null);
    try {
      const response = await fetch(`/api/admin/campaigns/${campaignId}/draft-preview`, {
        method: "POST",
      });
      await consumeDraftGenerationStream(response, (generatedCount) => {
        setGenerationProgress(generatedCount);
      });
      await loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "원고를 사전 생성하지 못했습니다.");
      setOpen(true);
      setBusy(null);
    } finally {
      setGenerationProgress(null);
    }
  };

  const visibleItems = useMemo(
    () => history?.items.filter((item) => item.status === filter) ?? [],
    [filter, history],
  );

  return (
    <>
      <button
        type="button"
        onClick={generate}
        disabled={busy !== null || metrics.unassignedCount >= 25}
        title={`${businessName} 원고 생성`}
        className="relative h-9 min-w-[92px] overflow-hidden whitespace-nowrap rounded-[9px] border border-brand/20 bg-brand-tint px-3 text-xs font-bold text-brand transition hover:border-brand/40 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {busy === "generating" && generationProgress !== null
          ? <DraftGenerationProgress current={generationProgress} target={25} />
          : `원고생성 ${Math.min(metrics.unassignedCount, 25)}/25`}
      </button>
      <button
        type="button"
        onClick={openHistory}
        disabled={busy !== null}
        title={`${businessName} 원고 보관함`}
        className="h-9 whitespace-nowrap rounded-[9px] border border-line bg-surface px-3 text-xs font-bold text-ink-sub transition hover:border-line-strong hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-45"
      >
        원고보관함
      </button>

      {open ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`draft-preview-title-${campaignId}`}
            className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[18px] border border-line bg-surface p-5 text-left shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-brand">캠페인 원고 보관함</p>
                <h3 id={`draft-preview-title-${campaignId}`} className="mt-1 text-lg font-bold text-ink">
                  {businessName}
                </h3>
                <p className="mt-1 text-xs text-ink-weak">
                  사전 생성 결과가 누적 저장되며, 품질 통과 원고는 참여자에게 순서대로 배정됩니다.
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="캠페인 원고 보관함 닫기"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-line text-lg text-ink-weak hover:bg-surface-alt"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-5">
              <Metric label="저장 원고" value={`${metrics.totalCount}건`} />
              <Metric label="미배정" value={`${metrics.unassignedCount}건`} />
              <Metric label="품질 제외" value={`${metrics.qualityExcludedCount}건`} />
              <Metric label="배정 완료" value={`${metrics.assignedCount}건`} />
              <Metric label="생성 배치" value={`${metrics.batchCount}회`} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-b border-line pb-3" role="tablist" aria-label="원고 상태">
              {FILTERS.map((item) => (
                <button
                  key={item.status}
                  type="button"
                  role="tab"
                  aria-selected={filter === item.status}
                  onClick={() => setFilter(item.status)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    filter === item.status ? "bg-brand text-white" : "bg-surface-alt text-ink-sub"
                  }`}
                >
                  {item.label} {metrics[item.metric]}건
                </button>
              ))}
            </div>

            {error ? (
              <p className="mt-4 rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-danger">
                {error}
              </p>
            ) : busy === "loading" && !history ? (
              <p className="py-12 text-center text-sm text-ink-weak">저장된 원고를 불러오는 중…</p>
            ) : visibleItems.length ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {visibleItems.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-[12px] border p-4 ${
                      item.status === "QUALITY_EXCLUDED"
                        ? "border-amber-200 bg-amber-50"
                        : "border-line bg-canvas"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-bold text-brand">#{item.slot + 1}</span>
                      <span className="rounded-full bg-brand-tint px-2 py-0.5 font-semibold text-brand">
                        {item.toneLabel}
                      </span>
                      <span className="text-ink-weak">{item.structureLabel}</span>
                      <span className="ml-auto text-ink-weak">유사도 {item.maxSimilarity.toFixed(3)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-ink">{item.text}</p>
                    <p className="mt-2 text-[11px] text-ink-weak">
                      근거 {item.evidenceIds.length}개 · {statusLabel(item.status)} · {formatGeneratedAt(item.generatedAt)}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-ink-weak">이 상태의 저장 원고가 없습니다.</p>
            )}

            {history?.hasMore ? (
              <p className="mt-3 text-center text-xs text-ink-weak">
                최신 원고 250건만 표시하고 있습니다.
              </p>
            ) : null}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-[9px] border border-line px-4 text-sm font-bold text-ink-sub hover:bg-surface-alt"
              >
                닫기
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function statusLabel(status: DraftStatus) {
  if (status === "UNASSIGNED") return "미배정";
  if (status === "ASSIGNED") return "배정 완료";
  return "품질 제외";
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-canvas p-2.5">
      <p className="text-[10px] font-semibold text-ink-weak">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}
