"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface SettlementRow {
  id: string;
  maskedPhone: string;
  amount: number;
  method: string;
  createdAt: string;
  payout: {
    bankName: string;
    maskedAccountNumber: string;
    accountHolder: string;
  } | null;
}

export function AdminSettlementBulkActions({ items }: { items: SettlementRow[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTotal = useMemo(() => {
    const selected = new Set(selectedIds);
    return items
      .filter((item) => selected.has(item.id))
      .reduce((sum, item) => sum + item.amount, 0);
  }, [items, selectedIds]);

  const allSelected = items.length > 0 && selectedIds.length === items.length;

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : items.map((item) => item.id));
  };

  const toggle = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const markPaid = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/settlements/mark-paid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settlementIds: selectedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "정산완료 처리에 실패했어요");
      const failed = data.failed?.length ?? 0;
      setSelectedIds([]);
      setMessage(
        failed
          ? `${data.processed?.length ?? 0}건 완료, ${failed}건 실패했습니다.`
          : `${data.processed?.length ?? 0}건을 정산완료 처리했어요.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  if (!items.length) {
    return <p className="text-sm text-ink-weak">정산 대기 요청이 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">
            선택 {selectedIds.length}건 · {selectedTotal.toLocaleString("ko-KR")}P
          </p>
          <p className="mt-1 text-xs text-ink-weak">
            엑셀 파일로 인터넷뱅킹 이체 후 정산완료 처리하세요.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex h-[44px] items-center justify-center rounded-btn bg-brand-tint px-4 text-sm font-semibold text-brand"
            onClick={() => window.location.assign("/api/admin/settlements/export")}
          >
            엑셀 다운로드
          </button>
          <Button
            className="h-[44px] text-sm"
            loading={busy}
            disabled={!selectedIds.length}
            onClick={markPaid}
          >
            선택 정산완료
          </Button>
        </div>
      </div>

      {message && <p className="rounded-card bg-brand-tint p-3 text-sm font-semibold text-brand">{message}</p>}
      {error && <p className="rounded-card bg-red-50 p-3 text-sm font-semibold text-danger">{error}</p>}

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <label className="flex items-center gap-3 border-b border-line px-3 py-3 text-sm font-semibold text-ink">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          전체 선택
        </label>
        <div className="divide-y divide-line">
          {items.map((item) => (
            <label key={item.id} className="grid cursor-pointer gap-2 px-3 py-3 text-sm sm:grid-cols-[28px_1fr_auto] sm:items-center">
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={() => toggle(item.id)}
              />
              <div>
                <p className="font-semibold text-ink">
                  {item.amount.toLocaleString("ko-KR")}P · {item.maskedPhone}
                </p>
                <p className="mt-1 text-xs text-ink-weak">
                  {item.payout
                    ? `${item.payout.bankName} ${item.payout.maskedAccountNumber} · ${item.payout.accountHolder}`
                    : "계좌 스냅샷 없음"}
                </p>
              </div>
              <p className="text-xs text-ink-weak">
                {new Date(item.createdAt).toLocaleDateString("ko-KR")}
              </p>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
