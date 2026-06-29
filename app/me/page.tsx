"use client";

import { useCallback, useEffect, useState } from "react";
import { AmountText, Button, Card, TextInput } from "@/components/ui";

interface Tx {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
}
interface Settle {
  id: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
}

const TX_LABEL: Record<string, string> = {
  EARN: "적립",
  SETTLE: "정산 출금",
  REDEEM: "사용",
  ADJUST: "조정",
};
const SETTLE_LABEL: Record<string, string> = {
  REQUESTED: "요청됨",
  APPROVED: "승인됨",
  PAID: "지급 완료",
  REJECTED: "반려됨",
};

export default function MePage() {
  const [authed, setAuthed] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [settles, setSettles] = useState<Settle[]>([]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = await fetch("/api/points");
    if (p.status === 401) {
      setAuthed(false);
      return;
    }
    const pd = await p.json();
    setBalance(pd.balance);
    setTxs(pd.items ?? []);
    const s = await fetch("/api/settlements");
    if (s.ok) {
      const sd = await s.json();
      setSettles(sd.items ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const requestSettle = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), method: "BANK" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.message ?? "요청에 실패했어요");
      setAmount("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-bold text-ink">로그인이 필요해요</p>
        <p className="mt-2 text-[15px] text-ink-sub">
          매장 QR 또는 <a className="text-brand" href="/r/demo">참여 링크</a>로 인증 후 이용하세요.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-6 px-5 py-8">
      <h1 className="text-[22px] font-bold text-ink">내 적립금</h1>

      <Card className="text-center">
        <p className="text-sm text-ink-sub">현재 잔액</p>
        <div className="mt-1">
          <AmountText value={balance ?? 0} className="text-[32px]" />
        </div>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-ink-weak">정산 요청</p>
        <TextInput
          inputMode="numeric"
          placeholder="정산할 금액 (P)"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button fullWidth loading={busy} disabled={!amount} onClick={requestSettle}>
          정산 요청하기
        </Button>
      </Card>

      <section>
        <p className="mb-2 text-sm font-semibold text-ink-weak">정산 내역</p>
        {settles.length ? (
          <ul className="space-y-1">
            {settles.map((s) => (
              <li key={s.id} className="flex justify-between text-sm">
                <span className="text-ink">{s.amount.toLocaleString("ko-KR")}P</span>
                <span className="text-ink-sub">{SETTLE_LABEL[s.status] ?? s.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-weak">정산 내역이 없어요</p>
        )}
      </section>

      <section>
        <p className="mb-2 text-sm font-semibold text-ink-weak">적립금 내역</p>
        {txs.length ? (
          <ul className="space-y-1">
            {txs.map((t) => (
              <li key={t.id} className="flex justify-between text-sm">
                <span className="text-ink-sub">{TX_LABEL[t.type] ?? t.type}</span>
                <span className={t.amount >= 0 ? "text-brand" : "text-ink"}>
                  {t.amount > 0 ? "+" : ""}
                  {t.amount.toLocaleString("ko-KR")}P
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-weak">내역이 없어요</p>
        )}
      </section>
    </main>
  );
}
