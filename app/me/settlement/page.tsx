"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { AmountText, Button, Card, TextInput } from "@/components/ui";
import { REVIEWER_ROUTES } from "@/lib/reviewer-navigation";

interface PointTransaction {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
}

interface SettlementItem {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
}

interface SettlementSummary {
  availableBalance: number;
  pendingAmount: number;
  minAmount: number;
  unitAmount: number;
  payoutAccount: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  } | null;
  profile: {
    settlementProfileRequired: boolean;
  };
  settlements: SettlementItem[];
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
  }>;
}

const POINT_LABEL: Record<string, string> = {
  EARN: "적립",
  SETTLE: "정산 신청",
  REDEEM: "사용",
  ADJUST: "조정",
};

const SETTLEMENT_LABEL: Record<string, string> = {
  REQUESTED: "정산 대기",
  EXPORTED: "은행 이체 결과 대기",
  PAID: "정산 완료",
  REJECTED: "반려",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

export default function ReviewerSettlementPage() {
  const [authed, setAuthed] = useState(true);
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"load" | "settlement" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const [summaryResponse, pointsResponse] = await Promise.all([
        fetch("/api/me/settlement-summary"),
        fetch("/api/points"),
      ]);
      if (summaryResponse.status === 401 || pointsResponse.status === 401) {
        setAuthed(false);
        return;
      }
      if (!summaryResponse.ok) throw new Error("정산 정보를 불러오지 못했어요.");

      setSummary(await summaryResponse.json());
      if (pointsResponse.ok) {
        const pointsData = await pointsResponse.json();
        setTransactions(pointsData.items ?? []);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "오류가 발생했어요.");
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
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

  const minAmount = summary?.minAmount ?? 3000;
  const unitAmount = summary?.unitAmount ?? 1000;
  const profileReady =
    Boolean(summary?.payoutAccount) && !summary?.profile.settlementProfileRequired;
  const canRequest =
    profileReady &&
    Number(amount) >= minAmount &&
    Number(amount) <= (summary?.availableBalance ?? 0) &&
    Number(amount) % unitAmount === 0;

  async function requestSettlement() {
    setBusy("settlement");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/settlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), method: "BANK" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message ?? "정산 신청에 실패했어요.");
      setAmount("");
      setNotice("정산 신청이 접수됐어요.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "오류가 발생했어요.");
    } finally {
      setBusy(null);
    }
  }

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
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-5 px-5 py-8">
      <header className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={REVIEWER_ROUTES.home}
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:border-brand/40 hover:text-brand"
          >
            <span aria-hidden="true">←</span>
            홈으로
          </Link>
          <Link href={REVIEWER_ROUTES.profile} className="text-sm font-semibold text-brand">
            내 정보 관리
          </Link>
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-ink">정산 신청</h1>
          <p className="mt-1 text-sm text-ink-sub">보유 포인트를 등록한 계좌로 정산받을 수 있어요.</p>
        </div>
      </header>

      {latestPaidNotice && (
        <Card className="border-brand/30 bg-brand-tint">
          <p className="text-sm font-bold text-brand">{latestPaidNotice.title}</p>
          <p className="mt-1 text-sm text-ink-sub">{latestPaidNotice.body}</p>
        </Card>
      )}
      {notice && <p className="rounded-card bg-brand-tint p-3 text-sm font-semibold text-brand">{notice}</p>}
      {error && <p className="rounded-card bg-red-50 p-3 text-sm font-semibold text-danger">{error}</p>}

      {!summary ? (
        <Card className="py-10 text-center text-sm text-ink-weak" aria-live="polite">
          정산 정보를 불러오는 중이에요.
        </Card>
      ) : (
        <>
      <section className="grid grid-cols-2 gap-3" aria-label="정산 포인트 요약">
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

      {!profileReady ? (
        <Card className="space-y-3">
          <div>
            <p className="font-bold text-ink">정산 정보 등록이 필요해요</p>
            <p className="mt-1 text-sm leading-6 text-ink-weak">
              이름, 연락처와 정산받을 계좌를 등록한 뒤 신청할 수 있어요.
            </p>
          </div>
          <Link
            href={REVIEWER_ROUTES.profile}
            className="inline-flex h-[52px] w-full items-center justify-center rounded-btn bg-brand-tint px-5 text-base font-semibold text-brand"
          >
            내 정보 등록하기
          </Link>
        </Card>
      ) : (
        <>
          <Card>
            <p className="text-sm font-bold text-ink">정산받을 계좌</p>
            <p className="mt-3 break-all rounded-card bg-canvas p-3 text-sm font-semibold tabular-nums text-ink">
              {summary?.payoutAccount?.bankName} {summary?.payoutAccount?.accountNumber}
            </p>
            <p className="mt-2 text-xs text-ink-weak">
              예금주 {summary?.payoutAccount?.accountHolder}
            </p>
          </Card>

          <Card className="space-y-3">
            <div>
              <p className="text-sm font-bold text-ink">신청 금액</p>
              <p className="mt-1 text-xs text-ink-weak">
                최소 {minAmount.toLocaleString("ko-KR")}P, {unitAmount.toLocaleString("ko-KR")}P
                단위로 신청할 수 있어요.
              </p>
            </div>
            <TextInput
              inputMode="numeric"
              placeholder={`${minAmount.toLocaleString("ko-KR")}P 이상`}
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
            />
            <div className="flex gap-2">
              <Button
                fullWidth
                variant="secondary"
                disabled={maxRequestable < minAmount}
                onClick={() => setAmount(String(maxRequestable))}
              >
                전액
              </Button>
              <Button
                fullWidth
                loading={busy === "settlement"}
                disabled={!canRequest}
                onClick={requestSettlement}
              >
                정산 신청
              </Button>
            </div>
          </Card>
        </>
      )}

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
                  <p className="font-semibold text-ink">
                    {settlement.amount.toLocaleString("ko-KR")}P
                  </p>
                  <p className="text-xs text-ink-weak">{formatDate(settlement.createdAt)}</p>
                </div>
                <span className="font-semibold text-ink-sub">
                  {SETTLEMENT_LABEL[settlement.status] ?? settlement.status}
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
        {transactions.length ? (
          <ul className="space-y-1">
            {transactions.map((transaction) => (
              <li key={transaction.id} className="flex justify-between text-sm">
                <span className="text-ink-sub">
                  {POINT_LABEL[transaction.type] ?? transaction.type}
                </span>
                <span className={transaction.amount >= 0 ? "text-brand" : "text-ink"}>
                  {transaction.amount > 0 ? "+" : ""}
                  {transaction.amount.toLocaleString("ko-KR")}P
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-weak">적립금 내역이 없어요.</p>
        )}
      </section>
        </>
      )}
    </main>
  );
}
