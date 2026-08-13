"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AdminLogout } from "@/components/admin/AdminLogout";
import { cn } from "@/lib/cn";

type AdminSection = "overview" | "campaigns" | "reviewProofs" | "settlements" | "reviewStyles" | "errors";

interface AdminShellProps {
  current: AdminSection;
  title: string;
  description: string;
  children: ReactNode;
  wideContent?: boolean;
}

export type AdminDisplayMode = "desktop" | "mobile";

const ADMIN_DISPLAY_MODE_STORAGE_KEY = "admin-display-mode";

export function nextAdminDisplayMode(mode: AdminDisplayMode): AdminDisplayMode {
  return mode === "desktop" ? "mobile" : "desktop";
}

const navigation: Array<{ id: AdminSection; href: string; label: string; description: string }> = [
  { id: "reviewStyles", href: "/admin/review-styles", label: "가상 리뷰어 관리", description: "기본 스타일 원고와 선택형 고급 튜닝" },
  { id: "overview", href: "/admin", label: "운영 현황", description: "대기 업무와 운영 신호" },
  { id: "campaigns", href: "/admin/campaigns", label: "캠페인 운영", description: "접수 반영과 장소 자료" },
  { id: "reviewProofs", href: "/admin/review-proofs", label: "리뷰 캡처 검수", description: "검수 대기 이미지 확인" },
  { id: "settlements", href: "/admin/settlements", label: "하나은행 정산", description: "이체 파일과 결과 대조" },
  { id: "errors", href: "/admin/errors", label: "오류 로그", description: "실패 원인과 조치 확인" },
];

function NavigationLink({
  item,
  current,
  compact = false,
}: {
  item: (typeof navigation)[number];
  current: AdminSection;
  compact?: boolean;
}) {
  const active = item.id === current;

  return (
    <Link
      href={item.href}
      className={cn(
        compact
          ? "inline-flex shrink-0 items-center border-b-2 px-1 py-3 text-sm font-semibold"
          : "block rounded-field px-3 py-3 transition-colors",
        active
          ? compact
            ? "border-brand text-brand"
            : "bg-brand-tint text-brand"
          : compact
            ? "border-transparent text-ink-weak hover:text-ink"
            : "text-ink-sub hover:bg-surface-alt hover:text-ink",
      )}
    >
      <span className="block">{item.label}</span>
      {!compact ? <span className="mt-1 block text-xs font-normal text-ink-weak">{item.description}</span> : null}
    </Link>
  );
}

function AdminDisplayModeSwitch({
  mode,
  onToggle,
  compact = false,
}: {
  mode: AdminDisplayMode;
  onToggle: () => void;
  compact?: boolean;
}) {
  const mobile = mode === "mobile";
  const nextModeLabel = mobile ? "PC 모드" : "모바일 모드";

  return (
    <div className={cn("flex items-center", compact ? "gap-2" : "justify-between gap-3")}>
      {!compact ? <span className="text-xs font-semibold text-ink-sub">화면 모드</span> : null}
      <div className="flex items-center gap-2">
        <span className={cn("text-xs font-semibold", mobile ? "text-ink-weak" : "text-brand")}>PC 모드</span>
        <button
          type="button"
          role="switch"
          aria-checked={mobile}
          aria-label={`${nextModeLabel}로 전환`}
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors focus-visible:outline-none",
            mobile ? "border-brand bg-brand" : "border-line-strong bg-surface-alt",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-5 w-5 rounded-full bg-surface shadow-sm transition-transform",
              mobile ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
        <span className={cn("text-xs font-semibold", mobile ? "text-brand" : "text-ink-weak")}>모바일 모드</span>
      </div>
    </div>
  );
}

export function AdminShell({
  current,
  title,
  description,
  children,
  wideContent = false,
}: AdminShellProps) {
  const [displayMode, setDisplayMode] = useState<AdminDisplayMode>("desktop");
  const mobileMode = displayMode === "mobile";

  useEffect(() => {
    const storedMode = window.localStorage.getItem(ADMIN_DISPLAY_MODE_STORAGE_KEY);
    if (storedMode === "mobile") setDisplayMode("mobile");
  }, []);

  const toggleDisplayMode = () => {
    setDisplayMode((currentMode) => {
      const nextMode = nextAdminDisplayMode(currentMode);
      window.localStorage.setItem(ADMIN_DISPLAY_MODE_STORAGE_KEY, nextMode);
      return nextMode;
    });
  };

  return (
    <div className="min-h-dvh bg-canvas" data-admin-display-mode={displayMode}>
      <div
        className={cn(
          "mx-auto flex min-h-dvh",
          wideContent ? "max-w-[1920px]" : "max-w-[1600px]",
        )}
      >
        <aside className={cn(
          "sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6",
          mobileMode ? "lg:hidden" : "lg:flex",
        )}>
          <Link href="/admin" className="px-3 text-base font-bold text-ink">
            리뷰 캠페인 운영
          </Link>
          <p className="mt-1 px-3 text-xs text-ink-weak">관리자 백오피스</p>

          <nav className="mt-8 space-y-1" aria-label="관리자 메뉴">
            {navigation.map((item) => (
              <NavigationLink key={item.id} item={item} current={current} />
            ))}
          </nav>

          <div className="mt-auto border-t border-line px-3 pt-5">
            <p className="mb-3 text-xs text-ink-weak">운영자 세션</p>
            <AdminLogout />
            <div className="mt-5 border-t border-line pt-4">
              <AdminDisplayModeSwitch mode={displayMode} onToggle={toggleDisplayMode} />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className={cn(
            "border-b border-line bg-surface",
            mobileMode
              ? "sticky top-0 z-20 block shadow-[0_8px_18px_rgba(25,31,40,0.06)]"
              : "lg:hidden",
          )}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
              <Link href="/admin" className="text-sm font-bold text-ink">
                리뷰 캠페인 운영
              </Link>
              <AdminLogout />
            </div>
            <div className="border-t border-line px-4 py-2 sm:px-5">
              <AdminDisplayModeSwitch mode={displayMode} onToggle={toggleDisplayMode} compact />
            </div>
            <nav className="flex min-h-12 gap-5 overflow-x-auto px-4 sm:px-5" aria-label="관리자 메뉴">
              {navigation.map((item) => (
                <NavigationLink key={item.id} item={item} current={current} compact />
              ))}
            </nav>
          </header>

          <div
            className={cn(
              "mx-auto",
              mobileMode
                ? "max-w-[760px] px-4 py-5 sm:px-5 sm:py-6"
                : cn("px-5 py-7 lg:px-8 lg:py-9", wideContent ? "max-w-[1680px]" : "max-w-[1440px]"),
            )}
          >
            <header className={cn("border-b border-line", mobileMode ? "mb-6 pb-5" : "mb-8 pb-6 lg:mb-9")}>
              <p className="text-sm font-semibold text-brand">관리자 운영</p>
              <h1 className={cn("mt-2 font-bold text-ink", mobileMode ? "text-[22px]" : "text-2xl lg:text-[28px]")}>{title}</h1>
              <p className={cn("mt-2 text-ink-sub", mobileMode ? "text-sm leading-6" : "text-[15px]")}>{description}</p>
            </header>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
