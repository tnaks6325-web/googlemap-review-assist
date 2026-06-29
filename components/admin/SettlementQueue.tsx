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
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.message ?? "처리에 실패했어요");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요");
    } finally {
      setBusy(null);
    }
  };

  if (!items.length) return <p className="text-sm text-ink-weak">대기 중인 정산이 없어요</p>;

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-danger">{error}</p>}
      {items.map((i) => (
        <div
          key={i.id}
          className="flex items-center justify-between rounded-card border border-line bg-surface p-3"
        >
          <div className="text-sm">
            <span className="font-semibold text-ink">{i.amount.toLocaleString("ko-KR")}P</span>{" "}
            <span className="text-ink-weak">· {i.phone} · {i.method}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" loading={busy === i.id + "approve"} onClick={() => act(i.id, "approve")}>
              승인
            </Button>
            <Button variant="text" loading={busy === i.id + "reject"} onClick={() => act(i.id, "reject")}>
              반려
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
