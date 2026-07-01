// 법무 링크 푸터(고객/공용 화면 하단).
export function Footer() {
  return (
    <footer className="mx-auto max-w-md px-5 pb-8 pt-4">
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-weak">
        <a href="/legal/terms" className="hover:text-ink-sub">이용약관</a>
        <a href="/legal/privacy" className="hover:text-ink-sub">개인정보 처리방침</a>
        <a href="/legal/reviews" className="hover:text-ink-sub">리뷰·적립 정책</a>
      </nav>
    </footer>
  );
}
