"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { campaignPreparedDraftReserveTarget } from "@/lib/domain/campaign-draft-reserve";

type DraftStatus = "UNASSIGNED" | "QUALITY_EXCLUDED" | "ASSIGNED";

interface PreparedDraftMetrics {
  totalCount: number;
  unassignedCount: number;
  qualityExcludedCount: number;
  assignedCount: number;
  batchCount: number;
}

export interface PreparedDraftItem {
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
}

export interface PreparedDraftHistory {
  campaignId: string;
  hasMore: boolean;
  metrics: PreparedDraftMetrics;
  items: PreparedDraftItem[];
}

interface ErrorResult {
  error?: { code?: string; message?: string; warnings?: unknown };
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function preparedDraftUrl(campaignId: string, draftId: string) {
  return `/api/admin/campaigns/${encodeURIComponent(campaignId)}/drafts/${encodeURIComponent(draftId)}`;
}

function qualityExcludedDraftsUrl(campaignId: string) {
  return `/api/admin/campaigns/${encodeURIComponent(campaignId)}/drafts/quality-excluded`;
}

export class PreparedDraftReviewRequiredError extends Error {
  constructor(public warnings: string[]) {
    super("품질 경고를 확인한 뒤 반영 여부를 선택해 주세요.");
    this.name = "PreparedDraftReviewRequiredError";
  }
}

function throwPreparedDraftMutationError(
  error: ErrorResult["error"] | undefined,
  fallbackMessage: string,
): never {
  const warnings = Array.isArray(error?.warnings)
    ? error.warnings.filter((warning): warning is string => typeof warning === "string").slice(0, 8)
    : [];
  if (error?.code === "DRAFT_REVIEW_REQUIRED") {
    throw new PreparedDraftReviewRequiredError(
      warnings.length ? warnings : [error.message || "원고 품질 경고를 확인해 주세요."],
    );
  }
  throw new Error(error?.message || fallbackMessage);
}

export async function updatePreparedDraftRequest({
  campaignId,
  draftId,
  text,
  force = false,
  fetcher = fetch,
}: {
  campaignId: string;
  draftId: string;
  text: string;
  force?: boolean;
  fetcher?: Fetcher;
}) {
  const response = await fetcher(preparedDraftUrl(campaignId, draftId), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, ...(force ? { force: true } : {}) }),
  });
  const data = (await response.json().catch(() => null)) as
    | { draft?: Pick<PreparedDraftItem, "id" | "text" | "qualityPassed" | "status">; error?: ErrorResult["error"] }
    | null;
  if (!response.ok || !data?.draft) {
    throwPreparedDraftMutationError(data?.error, "원고를 수정하지 못했습니다.");
  }
  return data.draft;
}

export async function deletePreparedDraftRequest({
  campaignId,
  draftId,
  fetcher = fetch,
}: {
  campaignId: string;
  draftId: string;
  fetcher?: Fetcher;
}) {
  const response = await fetcher(preparedDraftUrl(campaignId, draftId), { method: "DELETE" });
  const data = (await response.json().catch(() => null)) as
    | { deletedId?: string; error?: { message?: string } }
    | null;
  if (!response.ok || !data?.deletedId) {
    throw new Error(data?.error?.message || "원고를 삭제하지 못했습니다.");
  }
  return { deletedId: data.deletedId };
}

export async function promotePreparedDraftRequest({
  campaignId,
  draftId,
  force = false,
  fetcher = fetch,
}: {
  campaignId: string;
  draftId: string;
  force?: boolean;
  fetcher?: Fetcher;
}) {
  const response = await fetcher(preparedDraftUrl(campaignId, draftId), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "PROMOTE_TO_UNASSIGNED",
      ...(force ? { force: true } : {}),
    }),
  });
  const data = (await response.json().catch(() => null)) as
    | { draft?: Pick<PreparedDraftItem, "id" | "text" | "qualityPassed" | "status">; error?: ErrorResult["error"] }
    | null;
  if (!response.ok || !data?.draft) {
    throwPreparedDraftMutationError(data?.error, "품질 제외 원고를 미배정으로 이동하지 못했습니다.");
  }
  return data.draft;
}

export async function deleteQualityExcludedDraftsRequest({
  campaignId,
  fetcher = fetch,
}: {
  campaignId: string;
  fetcher?: Fetcher;
}) {
  const response = await fetcher(qualityExcludedDraftsUrl(campaignId), { method: "DELETE" });
  const data = (await response.json().catch(() => null)) as
    | { deletedCount?: number; error?: { message?: string } }
    | null;
  if (!response.ok || typeof data?.deletedCount !== "number") {
    throw new Error(data?.error?.message || "품질 제외 원고를 모두 삭제하지 못했습니다.");
  }
  return { deletedCount: data.deletedCount };
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
  attempted,
  attemptTarget,
}: {
  current: number;
  target: number;
  attempted?: number;
  attemptTarget?: number;
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
      <span className="relative z-10 flex flex-col items-center tabular-nums leading-tight">
        <span>원고생성 {safeCurrent}/{safeTarget}</span>
        {attempted !== undefined ? (
          <span className="text-[9px] font-semibold opacity-75">
            작성 {Math.max(0, attempted)}/{Math.max(1, attemptTarget ?? safeTarget)}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export const CAMPAIGN_DRAFT_AUTOFILL_MAX_ROUNDS = 12;
export const CAMPAIGN_DRAFT_AUTOFILL_MAX_STAGNANT_ROUNDS = 3;

export async function runCampaignDraftAutofill({
  initialUnassignedCount,
  targetCount = 5,
  generateRound,
  loadHistory,
  onHistory,
  maxRounds = CAMPAIGN_DRAFT_AUTOFILL_MAX_ROUNDS,
  maxStagnantRounds = CAMPAIGN_DRAFT_AUTOFILL_MAX_STAGNANT_ROUNDS,
}: {
  initialUnassignedCount: number;
  targetCount?: number;
  generateRound: (round: number) => Promise<void>;
  loadHistory: () => Promise<PreparedDraftHistory>;
  onHistory?: (history: PreparedDraftHistory) => void;
  maxRounds?: number;
  maxStagnantRounds?: number;
}) {
  const safeTargetCount = Math.max(1, targetCount);
  let unassignedCount = Math.max(0, initialUnassignedCount);
  let stagnantRounds = 0;
  let latestHistory: PreparedDraftHistory | null = null;

  for (let round = 1; unassignedCount < safeTargetCount && round <= maxRounds; round += 1) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await generateRound(round);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;

    latestHistory = await loadHistory();
    onHistory?.(latestHistory);
    const nextCount = latestHistory.metrics.unassignedCount;
    stagnantRounds = nextCount > unassignedCount ? 0 : stagnantRounds + 1;
    unassignedCount = nextCount;
    if (stagnantRounds >= maxStagnantRounds) {
      throw new Error(
        "새 품질 통과 원고가 추가되지 않아 자동 생성을 중단했습니다. 사실 카드와 원고 품질 조건을 확인해 주세요.",
      );
    }
  }

  if (!latestHistory) latestHistory = await loadHistory();
  if (latestHistory.metrics.unassignedCount < safeTargetCount) {
    throw new Error(`미배정 원고 ${safeTargetCount}건을 채우지 못했습니다. 잠시 후 이어서 생성해 주세요.`);
  }
  return latestHistory;
}

const FILTERS: Array<{ status: DraftStatus; label: string; metric: keyof PreparedDraftMetrics }> = [
  { status: "UNASSIGNED", label: "미배정", metric: "unassignedCount" },
  { status: "QUALITY_EXCLUDED", label: "품질 제외", metric: "qualityExcludedCount" },
  { status: "ASSIGNED", label: "배정 완료", metric: "assignedCount" },
];

type PendingDraftReview =
  | { kind: "edit"; item: PreparedDraftItem; text: string; warnings: string[] }
  | { kind: "promote"; item: PreparedDraftItem; warnings: string[] };

export function AdminCampaignDraftPreview({
  campaignId,
  businessName,
  totalQuota,
  readOnly = false,
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
  totalQuota?: number | null;
  readOnly?: boolean;
  initialMetrics?: PreparedDraftMetrics;
}) {
  const draftTarget = campaignPreparedDraftReserveTarget(totalQuota);
  const [busy, setBusy] = useState<"loading" | "generating" | null>(null);
  const [history, setHistory] = useState<PreparedDraftHistory | null>(null);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [filter, setFilter] = useState<DraftStatus>("UNASSIGNED");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<number | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [mutatingDraftId, setMutatingDraftId] = useState<string | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingDraftReview | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const preparedDraftCount = metrics.unassignedCount;

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

  const fetchHistory = async () => {
    const response = await fetch(`/api/admin/campaigns/${campaignId}/draft-preview`);
    const data = (await response.json().catch(() => null)) as
      | (PreparedDraftHistory & ErrorResult)
      | null;
    if (!response.ok || !data?.metrics || !Array.isArray(data.items)) {
      throw new Error(data?.error?.message || "저장된 원고를 불러오지 못했습니다.");
    }
    return data;
  };

  const applyHistory = (data: PreparedDraftHistory) => {
    setHistory(data);
    setMetrics(data.metrics);
  };

  const loadHistory = async () => {
    setBusy("loading");
    setError(null);
    try {
      applyHistory(await fetchHistory());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장된 원고를 불러오지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const openHistory = () => {
    setPendingReview(null);
    setOpen(true);
    void loadHistory();
  };

  const generate = async () => {
    setBusy("generating");
    setGenerationProgress(0);
    setError(null);
    try {
      await runCampaignDraftAutofill({
        initialUnassignedCount: preparedDraftCount,
        targetCount: draftTarget,
        generateRound: async () => {
          setGenerationProgress(0);
          const response = await fetch(`/api/admin/campaigns/${campaignId}/draft-preview`, {
            method: "POST",
          });
          await consumeDraftGenerationStream(response, (generatedCount) => {
            setGenerationProgress(generatedCount);
          });
        },
        loadHistory: fetchHistory,
        onHistory: applyHistory,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "원고를 사전 생성하지 못했습니다.");
      setOpen(true);
      setBusy(null);
    } finally {
      setGenerationProgress(null);
      setBusy(null);
    }
  };

  const beginEdit = (item: PreparedDraftItem) => {
    setEditingDraftId(item.id);
    setEditText(item.text);
    setError(null);
    setPendingReview(null);
  };

  const cancelEdit = () => {
    setEditingDraftId(null);
    setEditText("");
    setPendingReview(null);
  };

  const saveEdit = async (item: PreparedDraftItem, force = false, text = editText) => {
    setMutatingDraftId(item.id);
    setError(null);
    try {
      await updatePreparedDraftRequest({ campaignId, draftId: item.id, text, force });
      applyHistory(await fetchHistory());
      setPendingReview(null);
      cancelEdit();
    } catch (cause) {
      if (cause instanceof PreparedDraftReviewRequiredError) {
        setPendingReview({ kind: "edit", item, text, warnings: cause.warnings });
      } else {
        setError(cause instanceof Error ? cause.message : "원고를 수정하지 못했습니다.");
      }
    } finally {
      setMutatingDraftId(null);
    }
  };

  const removeDraft = async (item: PreparedDraftItem) => {
    if (!window.confirm("이 원고를 보관함에서 삭제할까요? 삭제한 원고는 복구할 수 없습니다.")) return;
    setMutatingDraftId(item.id);
    setError(null);
    try {
      await deletePreparedDraftRequest({ campaignId, draftId: item.id });
      applyHistory(await fetchHistory());
      if (editingDraftId === item.id) cancelEdit();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "원고를 삭제하지 못했습니다.");
    } finally {
      setMutatingDraftId(null);
    }
  };

  const promoteDraft = async (item: PreparedDraftItem, force = false) => {
    setMutatingDraftId(item.id);
    setError(null);
    try {
      await promotePreparedDraftRequest({ campaignId, draftId: item.id, force });
      applyHistory(await fetchHistory());
      setPendingReview(null);
      if (editingDraftId === item.id) cancelEdit();
    } catch (cause) {
      if (cause instanceof PreparedDraftReviewRequiredError) {
        setPendingReview({ kind: "promote", item, warnings: cause.warnings });
      } else {
        setError(cause instanceof Error ? cause.message : "품질 제외 원고를 미배정으로 이동하지 못했습니다.");
      }
    } finally {
      setMutatingDraftId(null);
    }
  };

  const applyPendingReview = () => {
    if (!pendingReview) return;
    if (pendingReview.kind === "edit") {
      void saveEdit(pendingReview.item, true, pendingReview.text);
      return;
    }
    void promoteDraft(pendingReview.item, true);
  };

  const removeAllQualityExcludedDrafts = async () => {
    const count = metrics.qualityExcludedCount;
    if (!count) return;
    if (!window.confirm(`품질 제외 원고 ${count}건을 모두 삭제할까요? 삭제한 원고는 복구할 수 없습니다.`)) return;
    setMutatingDraftId("quality-excluded-all");
    setError(null);
    try {
      await deleteQualityExcludedDraftsRequest({ campaignId });
      applyHistory(await fetchHistory());
      cancelEdit();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "품질 제외 원고를 모두 삭제하지 못했습니다.");
    } finally {
      setMutatingDraftId(null);
    }
  };

  const visibleItems = useMemo(
    () => history?.items.filter((item) => item.status === filter) ?? [],
    [filter, history],
  );

  return (
    <>
      {!readOnly ? <button
        type="button"
        onClick={generate}
        disabled={busy !== null || mutatingDraftId !== null || preparedDraftCount >= draftTarget}
        title={`${businessName} 원고 생성`}
        className="relative h-10 min-w-[112px] overflow-hidden whitespace-nowrap rounded-[9px] border border-brand/20 bg-brand-tint px-3 text-xs font-bold text-brand transition hover:border-brand/40 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {busy === "generating" && generationProgress !== null
          ? <DraftGenerationProgress
              current={preparedDraftCount + generationProgress}
              target={draftTarget}
              attempted={generationProgress}
            />
          : `원고생성 ${Math.min(preparedDraftCount, draftTarget)}/${draftTarget}`}
      </button> : null}
      <button
        type="button"
        onClick={openHistory}
        disabled={busy !== null || mutatingDraftId !== null}
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
                  onClick={() => {
                    setFilter(item.status);
                    setPendingReview(null);
                    setError(null);
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    filter === item.status ? "bg-brand text-white" : "bg-surface-alt text-ink-sub"
                  }`}
                >
                  {item.label} {metrics[item.metric]}건
                </button>
              ))}
              {!readOnly && filter === "QUALITY_EXCLUDED" ? (
                <button
                  type="button"
                  onClick={() => void removeAllQualityExcludedDrafts()}
                  disabled={metrics.qualityExcludedCount === 0 || mutatingDraftId !== null}
                  className="ml-auto rounded-[8px] border border-red-200 px-3 py-1.5 text-xs font-bold text-danger hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {mutatingDraftId === "quality-excluded-all" ? "삭제 중…" : "품질제외 모두 삭제"}
                </button>
              ) : null}
            </div>

            {pendingReview ? (
              <div role="alert" className="mt-4 rounded-[12px] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                <p className="font-bold">원고 품질 경고</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                  {pendingReview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
                <p className="mt-2 text-xs leading-5">
                  경고를 무시하면 이 원고가 참여자에게 배정될 수 있습니다.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingReview(null)}
                    disabled={mutatingDraftId !== null}
                    className="h-8 rounded-[8px] border border-amber-300 px-3 text-xs font-bold hover:bg-amber-100 disabled:opacity-50"
                  >
                    돌아가기
                  </button>
                  <button
                    type="button"
                    onClick={applyPendingReview}
                    disabled={mutatingDraftId !== null}
                    className="h-8 rounded-[8px] bg-amber-600 px-3 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {mutatingDraftId !== null ? "반영 중…" : "경고 무시하고 반영"}
                  </button>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-danger">
                {error}
              </p>
            ) : null}
            {busy === "loading" && !history ? (
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
                    {editingDraftId === item.id ? (
                      <div className="mt-3">
                        <label htmlFor={`draft-edit-${item.id}`} className="text-[11px] font-bold text-ink-sub">
                          원고 수정
                        </label>
                        <textarea
                          id={`draft-edit-${item.id}`}
                          value={editText}
                          onChange={(event) => {
                            setEditText(event.target.value);
                            setPendingReview(null);
                          }}
                          rows={5}
                          maxLength={600}
                          autoFocus
                          className="mt-1 w-full resize-y rounded-[9px] border border-line bg-surface p-3 text-[14px] leading-6 text-ink outline-none focus:border-brand"
                        />
                        <p className="mt-1 text-right text-[10px] text-ink-weak">
                          공백 제외 {editText.replace(/\s/gu, "").length}/200자 · 최소 30자
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-ink">{item.text}</p>
                    )}
                    <p className="mt-2 text-[11px] text-ink-weak">
                      근거 {item.evidenceIds.length}개 · {statusLabel(item.status)} · {formatGeneratedAt(item.generatedAt)}
                    </p>
                    {readOnly ? <p className="mt-3 text-[11px] font-semibold text-ink-weak">자동화 진행 중 · 열람 전용</p> : item.status === "ASSIGNED" ? (
                      <p className="mt-3 text-[11px] font-semibold text-ink-weak">
                        배정 완료 원고는 수정하거나 삭제할 수 없습니다.
                      </p>
                    ) : editingDraftId === item.id ? (
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={mutatingDraftId === item.id}
                          className="h-8 rounded-[8px] border border-line px-3 text-xs font-bold text-ink-sub hover:bg-surface-alt disabled:opacity-50"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit(item)}
                          disabled={mutatingDraftId === item.id}
                          className="h-8 rounded-[8px] bg-brand px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {mutatingDraftId === item.id ? "저장 중…" : "저장"}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 flex justify-end gap-2">
                        {item.status === "QUALITY_EXCLUDED" ? (
                          <button
                            type="button"
                            onClick={() => void promoteDraft(item)}
                            disabled={mutatingDraftId !== null}
                            className="h-8 rounded-[8px] border border-brand/30 bg-brand-tint px-3 text-xs font-bold text-brand hover:bg-blue-100 disabled:opacity-50"
                          >
                            {mutatingDraftId === item.id ? "이동 중…" : "미배정으로 이동"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => beginEdit(item)}
                          disabled={mutatingDraftId !== null}
                          className="h-8 rounded-[8px] border border-line px-3 text-xs font-bold text-ink-sub hover:bg-surface-alt disabled:opacity-50"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeDraft(item)}
                          disabled={mutatingDraftId !== null}
                          className="h-8 rounded-[8px] border border-red-200 px-3 text-xs font-bold text-danger hover:bg-red-50 disabled:opacity-50"
                        >
                          {mutatingDraftId === item.id ? "삭제 중…" : "삭제"}
                        </button>
                      </div>
                    )}
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
