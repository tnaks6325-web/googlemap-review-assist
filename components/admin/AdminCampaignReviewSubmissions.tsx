"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatAdminDateTime } from "@/lib/admin-date-format";

type DecisionStatus = "PENDING" | "PASSED" | "FAILED";
type ViewMode = "THUMBNAIL" | "TABLE";

interface SubmissionItem {
  id: string;
  reviewerLabel: string;
  fileName: string | null;
  imageUrl: string;
  submittedAt: string;
  status: DecisionStatus;
  analysisStatus: string | null;
  analysisReason: string | null;
  similarity: number | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
}

interface SubmissionsResponse {
  campaign: { id: string; campaignName: string; businessName: string };
  data: SubmissionItem[];
  summary: { total: number; pending: number; passed: number; failed: number };
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  error?: { message?: string };
}

const STATUS_LABELS: Record<DecisionStatus, string> = {
  PASSED: "검수 통과",
  PENDING: "확인 필요",
  FAILED: "검수 미통과",
};

const STATUS_CLASSES: Record<DecisionStatus, string> = {
  PASSED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  FAILED: "border-red-200 bg-red-50 text-danger",
};

const ANALYSIS_LABELS: Record<string, string> = {
  AUTO_APPROVE: "AI 자동 통과",
  AUTO_REJECT: "AI 미통과",
  MANUAL_REVIEW: "AI 수동 확인 요청",
  UNAVAILABLE: "AI 이미지 인식 불가",
};

function StatusBadge({ status }: { status: DecisionStatus }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function AnalysisText({ item }: { item: SubmissionItem }) {
  const similarity =
    item.similarity === null ? null : `${(item.similarity * 100).toFixed(1)}%`;
  return (
    <p className="mt-1 text-[11px] leading-5 text-ink-weak">
      {item.analysisStatus
        ? ANALYSIS_LABELS[item.analysisStatus] ?? item.analysisStatus
        : "AI 분석 결과 없음"}
      {similarity ? ` · 유사도 ${similarity}` : ""}
      {item.analysisReason ? ` · ${item.analysisReason}` : ""}
    </p>
  );
}

export function AdminCampaignReviewSubmissions({
  campaignId,
  businessName,
  initialCount,
}: {
  campaignId: string;
  businessName: string;
  initialCount: number;
}) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const enlargedCloseButtonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("THUMBNAIL");
  const [result, setResult] = useState<SubmissionsResponse | null>(null);
  const [items, setItems] = useState<SubmissionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<SubmissionItem | null>(null);
  const displayCount = result?.summary.total ?? initialCount;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (enlarged) setEnlarged(null);
      else setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [enlarged, open]);

  useEffect(() => {
    if (enlarged) enlargedCloseButtonRef.current?.focus();
  }, [enlarged]);

  const load = async (page: number, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/campaigns/${encodeURIComponent(campaignId)}/review-submissions?page=${page}&pageSize=24`,
      );
      const data = (await response.json().catch(() => null)) as SubmissionsResponse | null;
      if (!response.ok || !data?.pagination || !Array.isArray(data.data)) {
        throw new Error(data?.error?.message || "리뷰 제출함을 불러오지 못했습니다.");
      }
      setResult(data);
      setItems((current) => (append ? [...current, ...data.data] : data.data));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "리뷰 제출함을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const openSubmissions = () => {
    setOpen(true);
    setView("THUMBNAIL");
    setItems([]);
    setResult(null);
    setMessage(null);
    setEnlarged(null);
    void load(1);
  };

  const decide = async (item: SubmissionItem, action: "approve" | "reject") => {
    const prompt =
      action === "approve"
        ? "이 리뷰 캡처를 육안 검수 통과로 승인하고 포인트를 적립할까요?"
        : "이 리뷰 캡처를 검수 미통과로 확정할까요?";
    if (!window.confirm(prompt)) return;

    setMutatingId(item.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/review-proofs/${encodeURIComponent(item.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          note:
            action === "approve"
              ? "관리자 육안 검수 결과 정상 리뷰로 확인했습니다."
              : "관리자 육안 검수 결과 검수 미통과로 확정했습니다.",
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(data?.error?.message || "검수 결과를 저장하지 못했습니다.");
      }
      setMessage(
        action === "approve"
          ? "수동 승인과 포인트 적립을 완료했습니다."
          : "검수 미통과로 확정했습니다.",
      );
      await load(1);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "검수 결과를 저장하지 못했습니다.");
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openSubmissions}
        disabled={initialCount === 0}
        title={`${businessName} 제출 리뷰 이미지 ${initialCount}건`}
        className="h-9 whitespace-nowrap rounded-[9px] border border-brand/20 bg-brand-tint px-3 text-xs font-bold text-brand transition hover:border-brand/40 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-alt disabled:text-ink-weak"
      >
        리뷰제출함 {displayCount}건
      </button>

      {open ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-5"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`review-submissions-title-${campaignId}`}
            className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[18px] border border-line bg-surface text-left shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <p className="text-xs font-bold text-brand">캠페인 리뷰 제출함</p>
                <h3
                  id={`review-submissions-title-${campaignId}`}
                  className="mt-1 text-lg font-bold text-ink"
                >
                  {businessName}
                </h3>
                <p className="mt-1 text-xs text-ink-weak">
                  제출 이미지와 AI 검수 결과를 비교하고 필요한 건을 직접 승인하거나 반려하세요.
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="리뷰 제출함 닫기"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-line text-lg text-ink-weak hover:bg-surface-alt"
              >
                ×
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              {result ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <SummaryMetric label="전체 제출" value={result.summary.total} />
                  <SummaryMetric label="검수 통과" value={result.summary.passed} tone="success" />
                  <SummaryMetric label="확인 필요" value={result.summary.pending} tone="warning" />
                  <SummaryMetric label="검수 미통과" value={result.summary.failed} tone="danger" />
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div className="flex gap-2" role="tablist" aria-label="리뷰 제출함 보기 방식">
                  {(["THUMBNAIL", "TABLE"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={view === mode}
                      onClick={() => setView(mode)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                        view === mode ? "bg-brand text-white" : "bg-surface-alt text-ink-sub"
                      }`}
                    >
                      {mode === "THUMBNAIL" ? "썸네일" : "테이블"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-ink-weak">불러온 이미지 {items.length}건</p>
              </div>

              <div aria-live="polite">
                {message ? (
                  <p className="mt-3 rounded-[10px] bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    {message}
                  </p>
                ) : null}
                {error ? (
                  <p className="mt-3 rounded-[10px] bg-red-50 px-4 py-3 text-sm font-semibold text-danger">
                    {error}
                  </p>
                ) : null}
              </div>

              {items.length > 0 && view === "THUMBNAIL" ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <SubmissionCard
                      key={item.id}
                      item={item}
                      busy={mutatingId === item.id}
                      onEnlarge={() => setEnlarged(item)}
                      onDecide={(action) => void decide(item, action)}
                    />
                  ))}
                </div>
              ) : null}

              {items.length > 0 && view === "TABLE" ? (
                <SubmissionTable
                  items={items}
                  mutatingId={mutatingId}
                  onEnlarge={setEnlarged}
                  onDecide={(item, action) => void decide(item, action)}
                />
              ) : null}

              {!loading && !error && result?.summary.total === 0 ? (
                <div className="py-16 text-center">
                  <p className="font-semibold text-ink">제출된 리뷰 이미지가 없습니다.</p>
                  <p className="mt-1 text-sm text-ink-weak">리뷰어가 캡처를 제출하면 이곳에 표시됩니다.</p>
                </div>
              ) : null}

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-weak">
                  <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  리뷰 이미지를 불러오는 중입니다.
                </div>
              ) : null}

              {!loading && result && result.pagination.page < result.pagination.totalPages ? (
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void load(result.pagination.page + 1, true)}
                    className="h-10 rounded-[9px] border border-line px-4 text-sm font-bold text-ink-sub hover:bg-surface-alt"
                  >
                    다음 이미지 더 보기
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          {enlarged ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="이미지 확대 보기"
              className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-4"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) setEnlarged(null);
              }}
            >
              <button
                ref={enlargedCloseButtonRef}
                type="button"
                onClick={() => setEnlarged(null)}
                aria-label="확대 이미지 닫기"
                className="absolute right-5 top-5 inline-flex size-10 items-center justify-center rounded-full bg-white text-2xl text-ink shadow-lg"
              >
                ×
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={enlarged.imageUrl}
                alt={`${enlarged.reviewerLabel} 제출 리뷰 캡처 확대`}
                className="max-h-[90vh] max-w-[94vw] rounded-[12px] bg-white object-contain shadow-2xl"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function SummaryMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-danger"
          : "text-ink";
  return (
    <div className="rounded-[11px] border border-line bg-surface-alt px-4 py-3">
      <p className="text-[11px] font-semibold text-ink-weak">{label}</p>
      <p className={`mt-1 text-xl font-black tabular-nums ${toneClass}`}>{value}건</p>
    </div>
  );
}

function SubmissionCard({
  item,
  busy,
  onEnlarge,
  onDecide,
}: {
  item: SubmissionItem;
  busy: boolean;
  onEnlarge: () => void;
  onDecide: (action: "approve" | "reject") => void;
}) {
  return (
    <article className="overflow-hidden rounded-[13px] border border-line bg-surface">
      <button
        type="button"
        onClick={onEnlarge}
        aria-label={`${item.reviewerLabel} 리뷰 이미지 확대 보기`}
        className="group relative block h-52 w-full overflow-hidden bg-surface-alt"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt="제출된 구글맵 리뷰 캡처" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        <span className="absolute bottom-2 right-2 rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-bold text-white">
          크게 보기
        </span>
      </button>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{item.fileName || "리뷰 캡처"}</p>
            <p className="mt-1 text-[11px] text-ink-weak">
              {item.reviewerLabel} · {formatAdminDateTime(item.submittedAt)}
            </p>
          </div>
          <StatusBadge status={item.status} />
        </div>
        <AnalysisText item={item} />
        {item.reviewNote ? <p className="mt-2 text-[11px] text-ink-weak">검수 메모 · {item.reviewNote}</p> : null}
        {item.status !== "PASSED" ? (
          <DecisionButtons busy={busy} onDecide={onDecide} />
        ) : (
          <p className="mt-3 text-right text-[11px] font-semibold text-emerald-700">포인트 지급 완료</p>
        )}
      </div>
    </article>
  );
}

function SubmissionTable({
  items,
  mutatingId,
  onEnlarge,
  onDecide,
}: {
  items: SubmissionItem[];
  mutatingId: string | null;
  onEnlarge: (item: SubmissionItem) => void;
  onDecide: (item: SubmissionItem, action: "approve" | "reject") => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-[12px] border border-line">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-surface-alt text-[11px] text-ink-weak">
          <tr>
            <th className="px-3 py-3 font-bold">이미지</th>
            <th className="px-3 py-3 font-bold">파일 · 리뷰어</th>
            <th className="px-3 py-3 font-bold">제출일</th>
            <th className="px-3 py-3 font-bold">AI 검수</th>
            <th className="px-3 py-3 font-bold">최종 상태</th>
            <th className="px-3 py-3 text-right font-bold">관리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => onEnlarge(item)}
                  aria-label={`${item.reviewerLabel} 리뷰 이미지 확대 보기`}
                  className="block size-16 overflow-hidden rounded-[8px] border border-line bg-surface-alt"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt="제출 리뷰 썸네일" className="h-full w-full object-cover" />
                </button>
              </td>
              <td className="max-w-56 px-3 py-3">
                <p className="truncate font-bold text-ink">{item.fileName || "리뷰 캡처"}</p>
                <p className="mt-1 truncate text-xs text-ink-weak">{item.reviewerLabel}</p>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-sub">
                {formatAdminDateTime(item.submittedAt)}
              </td>
              <td className="max-w-72 px-3 py-3"><AnalysisText item={item} /></td>
              <td className="px-3 py-3"><StatusBadge status={item.status} /></td>
              <td className="px-3 py-3 text-right">
                {item.status !== "PASSED" ? (
                  <DecisionButtons
                    busy={mutatingId === item.id}
                    onDecide={(action) => onDecide(item, action)}
                  />
                ) : (
                  <span className="text-xs font-semibold text-emerald-700">처리 완료</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DecisionButtons({
  busy,
  onDecide,
}: {
  busy: boolean;
  onDecide: (action: "approve" | "reject") => void;
}) {
  return (
    <div className="mt-3 flex justify-end gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => onDecide("approve")}
        className="h-8 whitespace-nowrap rounded-[8px] bg-brand px-3 text-[11px] font-bold text-white disabled:opacity-45"
      >
        {busy ? "처리 중…" : "수동 승인"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onDecide("reject")}
        className="h-8 whitespace-nowrap rounded-[8px] border border-red-200 px-3 text-[11px] font-bold text-danger hover:bg-red-50 disabled:opacity-45"
      >
        반려 확정
      </button>
    </div>
  );
}
