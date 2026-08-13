import type { ReactNode } from "react";
import Link from "next/link";
import { AdminLogout } from "@/components/admin/AdminLogout";
import { cn } from "@/lib/cn";

type AdminSection = "overview" | "campaigns" | "reviewProofs" | "reviewers" | "settlements" | "fineTuning" | "reviewStyles" | "errors";

interface AdminShellProps {
  current: AdminSection;
  title: string;
  description: string;
  children: ReactNode;
  wideContent?: boolean;
}

const navigation: Array<{ id: AdminSection; href: string; label: string; description: string }> = [
  { id: "reviewStyles", href: "/admin/review-styles", label: "가상 리뷰어 스타일", description: "리뷰어별 학습 원고와 참고 링크" },
  { id: "fineTuning", href: "/admin/fine-tuning", label: "원고 파인튜닝", description: "학습 자료와 Vertex 모델 운영" },
  { id: "overview", href: "/admin", label: "운영 현황", description: "대기 업무와 운영 신호" },
  { id: "campaigns", href: "/admin/campaigns", label: "캠페인 운영", description: "접수 반영과 장소 자료" },
  { id: "reviewProofs", href: "/admin/review-proofs", label: "리뷰 캡처 검수", description: "검수 대기 이미지 확인" },
  { id: "reviewers", href: "/admin/reviewers", label: "리뷰어 · 정산", description: "검수와 지급 관리" },
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

export function AdminShell({
  current,
  title,
  description,
  children,
  wideContent = false,
}: AdminShellProps) {
  return (
    <div className="min-h-dvh bg-canvas">
      <div
        className={cn(
          "mx-auto flex min-h-dvh",
          wideContent ? "max-w-[1920px]" : "max-w-[1600px]",
        )}
      >
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
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
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-line bg-surface lg:hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <Link href="/admin" className="text-sm font-bold text-ink">
                리뷰 캠페인 운영
              </Link>
              <AdminLogout />
            </div>
            <nav className="flex gap-5 overflow-x-auto px-5" aria-label="관리자 메뉴">
              {navigation.map((item) => (
                <NavigationLink key={item.id} item={item} current={current} compact />
              ))}
            </nav>
          </header>

          <div
            className={cn(
              "mx-auto px-5 py-7 lg:px-8 lg:py-9",
              wideContent ? "max-w-[1680px]" : "max-w-[1440px]",
            )}
          >
            <header className="mb-8 border-b border-line pb-6 lg:mb-9">
              <p className="text-sm font-semibold text-brand">관리자 운영</p>
              <h1 className="mt-2 text-2xl font-bold text-ink lg:text-[28px]">{title}</h1>
              <p className="mt-2 text-[15px] text-ink-sub">{description}</p>
            </header>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
