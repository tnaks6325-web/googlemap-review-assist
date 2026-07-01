import type { ReactNode } from "react";

// 법무 문서 공용 셸. 초안 고지 배너 포함.
export function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <a href="/" className="text-sm text-ink-weak hover:text-ink-sub">
        ← 홈
      </a>
      <h1 className="mt-2 text-[22px] font-bold text-ink">{title}</h1>

      <p className="mt-4 rounded-card bg-brand-tint px-4 py-3 text-sm text-brand">
        본 문서는 표준 <b>초안</b>입니다. 실제 시행 전 사업자 정보(대괄호 표기)를 채우고,
        법률 전문가의 검토를 받아야 합니다.
      </p>

      <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-ink-sub">{children}</div>

      <nav className="mt-10 flex gap-4 border-t border-line pt-6 text-sm text-ink-weak">
        <a href="/legal/terms" className="hover:text-ink-sub">이용약관</a>
        <a href="/legal/privacy" className="hover:text-ink-sub">개인정보 처리방침</a>
        <a href="/legal/reviews" className="hover:text-ink-sub">리뷰·적립 정책</a>
      </nav>
    </main>
  );
}

export function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-bold text-ink">
        제{n}조 · {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
