"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface Item {
  id: string;
  amount: number;
  method: string;
  phone: string;
}

export function SettlementQueue({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (id: string, action: "approve" | "reject") => {
    setBusy(id + action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/settlements/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "처리에 실패했어요");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요");
    } finally {
      setBusy(null);
    }
  };

  if (!items.length) return <p className="text-sm text-ink-weak">대기 중인 정산이 없습니다.</p>;

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-danger">{error}</p>}
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded-card border border-line bg-surface p-3"
        >
          <div className="text-sm">
            <span className="font-semibold text-ink">{item.amount.toLocaleString("ko-KR")}P</span>{" "}
            <span className="text-ink-weak">· {item.phone} · {item.method}</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              loading={busy === item.id + "approve"}
              onClick={() => act(item.id, "approve")}
            >
              정산완료
            </Button>
            <Button
              variant="text"
              loading={busy === item.id + "reject"}
              onClick={() => act(item.id, "reject")}
            >
              반려
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
