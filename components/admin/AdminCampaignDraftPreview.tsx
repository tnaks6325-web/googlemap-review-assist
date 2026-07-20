"use client";

import { useEffect, useRef, useState } from "react";

interface PreviewResult {
  campaignId: string;
  text: string;
  provider: string;
  model: string;
  sourceGroupCount: number;
  generatedAt: string;
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
      if (!data?.text) throw new Error("생성된 테스트 원고가 없습니다.");
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
            className="w-full max-w-xl rounded-[18px] border border-line bg-surface p-5 text-left shadow-2xl"
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
                <div className="mt-5 rounded-[12px] border border-line bg-canvas p-4">
                  <p className="text-[11px] font-bold text-ink-weak">생성 결과</p>
                  <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-ink">
                    {preview.text}
                  </p>
                </div>
                <p className="mt-3 text-xs text-ink-weak">
                  참고자료 {preview.sourceGroupCount}종 · {preview.provider} / {preview.model}
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
