"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { AmountText, Button, Card, TextInput } from "@/components/ui";

interface Tx {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
}

interface SettlementItem {
  id: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface PayoutAccount {
  bankName: string;
  accountLast4: string;
  maskedAccountNumber: string;
  accountHolder: string;
  updatedAt: string;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

interface SettlementSummary {
  availableBalance: number;
  pendingAmount: number;
  paidAmount: number;
  minAmount: number;
  unitAmount: number;
  payoutAccount: PayoutAccount | null;
  settlements: SettlementItem[];
  notifications: NotificationItem[];
}

const TX_LABEL: Record<string, string> = {
  EARN: "적립",
  SETTLE: "정산 신청",
  REDEEM: "사용",
  ADJUST: "조정",
};

const SETTLE_LABEL: Record<string, string> = {
  REQUESTED: "정산 대기",
  PAID: "정산 완료",
  REJECTED: "반려",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

const BANK_OPTIONS = [
  "KB국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "NH농협은행",
  "IBK기업은행",
  "SC제일은행",
  "한국씨티은행",
  "카카오뱅크",
  "케이뱅크",
  "토스뱅크",
  "KDB산업은행",
  "수협은행",
  "부산은행",
  "대구은행",
  "광주은행",
  "전북은행",
  "경남은행",
  "제주은행",
  "새마을금고",
  "신협",
  "우체국",
];

export default function MePage() {
  const [authed, setAuthed] = useState(true);
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [editingAccount, setEditingAccount] = useState(false);
  const [busy, setBusy] = useState<"load" | "account" | "settlement" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const [summaryRes, pointsRes] = await Promise.all([
        fetch("/api/me/settlement-summary"),
        fetch("/api/points"),
      ]);
      if (summaryRes.status === 401 || pointsRes.status === 401) {
        setAuthed(false);
        return;
      }
      if (!summaryRes.ok) throw new Error("정산 정보를 불러오지 못했어요");
      const summaryData = (await summaryRes.json()) as SettlementSummary;
      setSummary(summaryData);
      setEditingAccount(!summaryData.payoutAccount);
      if (summaryData.payoutAccount) {
        setBankName(summaryData.payoutAccount.bankName);
        setAccountHolder(summaryData.payoutAccount.accountHolder);
        setAccountNumber("");
      }
      if (pointsRes.ok) {
        const pointsData = await pointsRes.json();
        setTxs(pointsData.items ?? []);
      }
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const latestPaidNotice = useMemo(
    () => summary?.notifications.find((item) => item.type === "SETTLEMENT_PAID") ?? null,
    [summary],
  );

  const maxRequestable = useMemo(() => {
    if (!summary) return 0;
    return Math.floor(summary.availableBalance / summary.unitAmount) * summary.unitAmount;
  }, [summary]);

  const saveAccount = async () => {
    setBusy("account");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/me/payout-account", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bankName, accountNumber, accountHolder }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "계좌 등록에 실패했어요");
      setAccountNumber("");
      setNotice("정산 계좌가 등록됐어요.");
      await load();
      setEditingAccount(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요");
    } finally {
      setBusy(null);
    }
  };

  const requestSettle = async () => {
    setBusy("settlement");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), method: "BANK" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "정산 신청에 실패했어요");
      setAmount("");
      setNotice("정산 신청이 접수됐어요.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요");
    } finally {
      setBusy(null);
    }
  };

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-bold text-ink">로그인이 필요해요</p>
        <GoogleSignInButton
          className="mt-5 w-full"
          onSuccess={() => {
            setAuthed(true);
            void load();
          }}
          onError={setError}
        />
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <p className="mt-2 text-[15px] text-ink-sub">
          <Link className="font-semibold text-brand" href="/r/demo">
            리뷰어 참여 페이지
          </Link>
          에서 휴대폰 번호로 먼저 로그인해 주세요.
        </p>
      </main>
    );
  }

  const minAmount = summary?.minAmount ?? 3000;
  const unitAmount = summary?.unitAmount ?? 1000;
  const canRequest =
    Boolean(summary?.payoutAccount) &&
    Number(amount) >= minAmount &&
    Number(amount) % unitAmount === 0;

  return (
    <main className="mx-auto max-w-md space-y-5 px-5 py-8">
      <header>
        <h1 className="text-[22px] font-bold text-ink">내 적립금</h1>
        <p className="mt-1 text-sm text-ink-sub">계좌 등록 후 정산 신청을 진행할 수 있어요.</p>
      </header>

      {latestPaidNotice && (
        <Card className="border-brand/30 bg-brand-tint">
          <p className="text-sm font-bold text-brand">{latestPaidNotice.title}</p>
          <p className="mt-1 text-sm text-ink-sub">{latestPaidNotice.body}</p>
        </Card>
      )}

      {notice && <p className="rounded-card bg-brand-tint p-3 text-sm font-semibold text-brand">{notice}</p>}
      {error && <p className="rounded-card bg-red-50 p-3 text-sm font-semibold text-danger">{error}</p>}

      <section className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-ink-weak">정산 가능</p>
          <div className="mt-1">
            <AmountText value={summary?.availableBalance ?? 0} className="text-[26px]" />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-weak">정산 대기</p>
          <div className="mt-1">
            <AmountText value={summary?.pendingAmount ?? 0} className="text-[26px]" />
          </div>
        </Card>
      </section>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-ink">정산 계좌</p>
            <p className="mt-1 text-xs text-ink-weak">최초 1회 등록 후 정산 때마다 자동 적용됩니다.</p>
          </div>
          {summary?.payoutAccount && (
            <button
              type="button"
              className="text-sm font-semibold text-brand"
              onClick={() => setEditingAccount((value) => !value)}
            >
              {editingAccount ? "닫기" : "수정"}
            </button>
          )}
        </div>

        {summary?.payoutAccount && !editingAccount ? (
          <div className="rounded-card bg-canvas p-3 text-sm">
            <p className="font-semibold text-ink">
              {summary.payoutAccount.bankName} {summary.payoutAccount.maskedAccountNumber}
            </p>
            <p className="mt-1 text-ink-sub">예금주 {summary.payoutAccount.accountHolder}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <select
              className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-base text-ink outline-none transition focus:border-brand"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            >
              <option value="">은행 선택</option>
              {BANK_OPTIONS.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </select>
            <TextInput
              inputMode="numeric"
              placeholder="계좌번호"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 32))}
            />
            <TextInput
              placeholder="예금주"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
            />
            <Button
              fullWidth
              variant="secondary"
              loading={busy === "account"}
              disabled={!bankName || !accountNumber || !accountHolder}
              onClick={saveAccount}
            >
              정산 계좌 등록
            </Button>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <p className="text-sm font-bold text-ink">정산 신청</p>
          <p className="mt-1 text-xs text-ink-weak">
            최소 {minAmount.toLocaleString("ko-KR")}P, {unitAmount.toLocaleString("ko-KR")}P 단위로 신청할 수 있어요.
          </p>
        </div>
        <TextInput
          inputMode="numeric"
          placeholder={`${minAmount.toLocaleString("ko-KR")}P 이상`}
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
        />
        <div className="flex gap-2">
          <Button
            fullWidth
            variant="secondary"
            disabled={!summary?.payoutAccount || maxRequestable < minAmount}
            onClick={() => setAmount(String(maxRequestable))}
          >
            전액
          </Button>
          <Button
            fullWidth
            loading={busy === "settlement"}
            disabled={!canRequest}
            onClick={requestSettle}
          >
            정산 신청
          </Button>
        </div>
      </Card>

      <section>
        <p className="mb-2 text-sm font-semibold text-ink-weak">정산 내역</p>
        {summary?.settlements.length ? (
          <ul className="space-y-2">
            {summary.settlements.map((settlement) => (
              <li
                key={settlement.id}
                className="flex items-center justify-between rounded-card border border-line bg-surface p-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-ink">{settlement.amount.toLocaleString("ko-KR")}P</p>
                  <p className="text-xs text-ink-weak">{formatDate(settlement.createdAt)}</p>
                </div>
                <span className="font-semibold text-ink-sub">
                  {SETTLE_LABEL[settlement.status] ?? settlement.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-weak">정산 내역이 없어요.</p>
        )}
      </section>

      <section>
        <p className="mb-2 text-sm font-semibold text-ink-weak">적립금 내역</p>
        {txs.length ? (
          <ul className="space-y-1">
            {txs.map((tx) => (
              <li key={tx.id} className="flex justify-between text-sm">
                <span className="text-ink-sub">{TX_LABEL[tx.type] ?? tx.type}</span>
                <span className={tx.amount >= 0 ? "text-brand" : "text-ink"}>
                  {tx.amount > 0 ? "+" : ""}
                  {tx.amount.toLocaleString("ko-KR")}P
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-weak">적립금 내역이 없어요.</p>
        )}
      </section>
    </main>
  );
}
