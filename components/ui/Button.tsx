import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "text";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  loading?: boolean;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed select-none";

const variants: Record<Variant, string> = {
  // 화면당 1개. 하단 고정 풀폭 CTA의 기본형
  primary: "h-[52px] px-5 text-base rounded-btn bg-brand text-white hover:bg-brand-pressed",
  // 부가 행동 (다시 생성 등)
  secondary:
    "h-[52px] px-5 text-base rounded-btn bg-brand-tint text-brand hover:brightness-95",
  // 회피/저위계 동선 (그냥 마치기, 나중에 하기)
  text: "h-11 px-2 text-[15px] rounded-btn bg-transparent text-ink-weak hover:text-ink-sub",
};

export function Button({
  variant = "primary",
  fullWidth,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(base, variants[variant], fullWidth && "w-full", className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        children
      )}
    </button>
  );
}
