"use client";

import { cn } from "@/lib/cn";

interface ChipProps {
  label: string;
  selected?: boolean;
  onToggle?: () => void;
}

/** 멀티선택 칩 (예: 좋았던 메뉴 선택) */
export function Chip({ label, selected, onToggle }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium transition",
        selected
          ? "border-brand bg-brand-tint text-brand"
          : "border-line bg-surface text-ink-sub hover:border-line-strong"
      )}
    >
      {selected && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {label}
    </button>
  );
}
