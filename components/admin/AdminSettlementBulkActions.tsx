import Link from "next/link";

interface SettlementRow {
  id: string;
  amount: number;
}

/**
 * Direct settlement completion is intentionally unavailable here. The dedicated
 * Hana screen requires a downloaded batch and a final bank result before money
 * status can change.
 */
export function AdminSettlementBulkActions({ items }: { items: SettlementRow[] }) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <p className="text-sm font-semibold text-ink">
        지급 대기 {items.length}건 · {total.toLocaleString("ko-KR")}P
      </p>
      <p className="mt-1 text-sm text-ink-weak">
        하나은행 최종 결과 파일을 대조한 뒤에만 입금 완료 또는 계좌 오류로 반영됩니다.
      </p>
      <Link
        href="/admin/settlements"
        className="mt-3 inline-flex h-[44px] items-center justify-center rounded-btn bg-brand px-4 text-sm font-semibold text-white"
      >
        하나은행 정산 관리
      </Link>
    </section>
  );
}
