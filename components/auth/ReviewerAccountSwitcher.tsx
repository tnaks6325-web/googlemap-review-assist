"use client";

import { useEffect, useReducer } from "react";
import { createPortal } from "react-dom";
import { GoogleAccountChooserButton } from "@/components/auth/GoogleAccountChooserButton";

export interface ReviewerAccountSwitcherState {
  open: boolean;
}

type ReviewerAccountSwitcherAction = "open" | "close";

const INITIAL_STATE: ReviewerAccountSwitcherState = {
  open: false,
};

export function reviewerAccountSwitcherReducer(
  state: ReviewerAccountSwitcherState,
  action: ReviewerAccountSwitcherAction,
): ReviewerAccountSwitcherState {
  if (action === "open") return { open: true };
  return INITIAL_STATE;
}

export function ReviewerAccountSwitcher() {
  const [state, dispatch] = useReducer(reviewerAccountSwitcherReducer, INITIAL_STATE);

  useEffect(() => {
    if (!state.open) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch("close");
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [state.open]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={state.open}
        onClick={() => dispatch("open")}
        className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        계정 전환
      </button>

      {state.open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-5 text-ink backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-switch-title"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) dispatch("close");
            }}
          >
            <div className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="account-switch-title" className="text-lg font-bold">
                    Google 계정 전환
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-ink-weak">
                    다른 Google 계정을 추가하거나 전환할 수 있어요. 기존 계정의 정보와 참여 이력은
                    그대로 보관됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="계정 전환 창 닫기"
                  autoFocus
                  onClick={() => dispatch("close")}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-lg text-ink-weak hover:text-ink"
                >
                  ×
                </button>
              </div>

              <div className="mt-5">
                <GoogleAccountChooserButton onSuccess={() => dispatch("close")} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
