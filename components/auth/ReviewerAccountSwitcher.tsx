"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ReviewerGoogleSignIn } from "@/components/auth/ReviewerGoogleSignIn";

export function ReviewerAccountSwitcher() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        계정 전환
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-5 text-ink backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-switch-title"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setOpen(false);
            }}
          >
            <div className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="account-switch-title" className="text-lg font-bold">
                    Google 계정 전환
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-ink-weak">
                    사용할 계정을 선택해 주세요. 기존 계정의 정보와 참여 이력은 그대로 보관됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="계정 전환 창 닫기"
                  autoFocus
                  onClick={() => setOpen(false)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-lg text-ink-weak hover:text-ink"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 rounded-[14px] border border-line p-1">
                <ReviewerGoogleSignIn mode="switch" onSuccess={() => setOpen(false)} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
