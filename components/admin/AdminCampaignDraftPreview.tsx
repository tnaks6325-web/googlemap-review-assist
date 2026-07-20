"use client";

import { useEffect, useRef, useState } from "react";

interface PreviewResult {
  campaignId: string;
  text: string;
  provider: string;
  model: string;
  sourceGroupCount: number;
  generatedAt: string;
  promptVersion: string;
  items: Array<{
    slot: number;
    styleId: string;
    toneLabel: string;
    structureLabel: string;
    text: string;
    evidenceIds: string[];
    maxSimilarity: number;
    qualityPassed: boolean;
  }>;
  metrics: {
    styleCoverage: number;
    maxSimilarity: number;
    averageSimilarity: number;
    duplicateCount: number;
    evidenceCoverage: number;
  };
}

interface ErrorResult {
  error?: { message?: string };
}

export function AdminCampaignDraftPreview({
  campaignId,
  businessName,
}: {
  campaignId: string;
  businessName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/campaigns/${campaignId}/draft-preview`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as
        | (PreviewResult & ErrorResult)
        | null;
      if (!response.ok) {
        throw new Error(data?.error?.message || "테스트 원고를 생성하지 못했습니다.");
      }
      if (!data?.items?.length) throw new Error("생성된 25개 테스트 원고가 없습니다.");
      setPreview(data);
      setOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "테스트 원고를 생성하지 못했습니다.");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        title={`${businessName} 테스트 원고 생성`}
        className="h-9 whitespace-nowrap rounded-[9px] border border-brand/20 bg-brand-tint px-3 text-xs font-bold text-brand transition hover:border-brand/40 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {loading ? "생성 중…" : "원고생성 테스트"}
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
                <p className="text-xs font-bold text-brand">원고 생성 테스트</p>
                <h3
                  id={`draft-preview-title-${campaignId}`}
                  className="mt-1 text-lg font-bold text-ink"
                >
                  {businessName}
                </h3>
                <p className="mt-1 text-xs text-ink-weak">
                  실제 참여 기록이나 리뷰어 원고에는 저장되지 않는 미리보기입니다.
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="원고 생성 테스트 닫기"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-line text-lg text-ink-weak hover:bg-surface-alt"
              >
                ×
              </button>
            </div>

            {error ? (
              <p className="mt-5 rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-danger">
                {error}
              </p>
            ) : preview ? (
              <>
                <div className="mt-5 grid gap-2 sm:grid-cols-5">
                  <Metric label="스타일" value={`${preview.metrics.styleCoverage}/25`} />
                  <Metric label="최대 유사도" value={preview.metrics.maxSimilarity.toFixed(3)} />
                  <Metric label="평균 유사도" value={preview.metrics.averageSimilarity.toFixed(3)} />
                  <Metric label="중복 쌍" value={`${preview.metrics.duplicateCount}개`} />
                  <Metric label="근거 사용률" value={`${Math.round(preview.metrics.evidenceCoverage * 100)}%`} />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {preview.items.map((item) => (
                    <article
                      key={item.styleId}
                      className={`rounded-[12px] border p-4 ${
                        item.qualityPassed ? "border-line bg-canvas" : "border-amber-200 bg-amber-50"
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
                        근거 {item.evidenceIds.length}개 · {item.qualityPassed ? "품질 통과" : "보정 필요"}
                      </p>
                    </article>
                  ))}
                </div>
                <p className="mt-3 text-xs text-ink-weak">
                  참고자료 {preview.sourceGroupCount}종 · {preview.provider} / {preview.model} · {preview.promptVersion}
                </p>
              </>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-[9px] border border-line px-4 text-sm font-bold text-ink-sub hover:bg-surface-alt"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={loading}
                className="h-10 rounded-[9px] bg-brand px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "생성 중…" : "다시 생성"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-canvas p-2.5">
      <p className="text-[10px] font-semibold text-ink-weak">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}
