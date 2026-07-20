"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Button, Card, TextInput } from "@/components/ui";
import { formatPhoneInput } from "@/lib/phone";
import { REVIEWER_ROUTES } from "@/lib/reviewer-navigation";

interface PayoutAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

interface ProfileSummary {
  name: string | null;
  phone: string | null;
  payoutAccount: PayoutAccount | null;
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
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [profileName, setProfileName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [editingAccount, setEditingAccount] = useState(false);
  const [busy, setBusy] = useState<"load" | "profile" | "account" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const response = await fetch("/api/me/settlement-summary");
      if (response.status === 401) {
        setAuthed(false);
        return;
      }
      if (!response.ok) throw new Error("내 정보를 불러오지 못했어요.");

      const data = await response.json();
      const nextSummary: ProfileSummary = {
        name: data.profile?.name ?? null,
        phone: data.profile?.phone ?? null,
        payoutAccount: data.payoutAccount ?? null,
      };
      setProfileSummary(nextSummary);
      setProfileName(nextSummary.name ?? "");
      setContactPhone(formatPhoneInput(nextSummary.phone ?? ""));
      setEditingAccount(!nextSummary.payoutAccount);
      if (nextSummary.payoutAccount) {
        setBankName(nextSummary.payoutAccount.bankName);
        setAccountHolder(nextSummary.payoutAccount.accountHolder);
        setAccountNumber("");
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

  async function saveProfile() {
    setBusy("profile");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/me/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: profileName, phone: contactPhone }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message ?? "기본 정보를 저장하지 못했어요.");
      setNotice("기본 정보를 저장했어요.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "오류가 발생했어요.");
    } finally {
      setBusy(null);
    }
  }

  async function saveAccount() {
    setBusy("account");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/me/payout-account", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bankName, accountNumber, accountHolder }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message ?? "계좌 등록에 실패했어요.");
      setAccountNumber("");
      setNotice("정산 계좌를 저장했어요.");
      await load();
      setEditingAccount(false);
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
        <Link
          href={REVIEWER_ROUTES.home}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:border-brand/40 hover:text-brand"
        >
          <span aria-hidden="true">←</span>
          홈으로
        </Link>
        <div>
          <h1 className="text-[22px] font-bold text-ink">내 정보 수정</h1>
          <p className="mt-1 text-sm text-ink-sub">연락처와 정산받을 계좌를 관리해요.</p>
        </div>
      </header>

      {notice && <p className="rounded-card bg-brand-tint p-3 text-sm font-semibold text-brand">{notice}</p>}
      {error && <p className="rounded-card bg-red-50 p-3 text-sm font-semibold text-danger">{error}</p>}

      {!profileSummary ? (
        <Card className="py-10 text-center text-sm text-ink-weak" aria-live="polite">
          내 정보를 불러오는 중이에요.
        </Card>
      ) : (
        <>
          <Card className="space-y-3">
            <div>
              <p className="text-sm font-bold text-ink">기본 정보</p>
              <p className="mt-1 text-xs leading-5 text-ink-weak">
                이름과 연락처는 정산 안내와 지급 확인에 사용합니다.
              </p>
            </div>
            <TextInput
              placeholder="이름"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value.slice(0, 80))}
            />
            <TextInput
              inputMode="tel"
              placeholder="010-0000-0000"
              value={contactPhone}
              onChange={(event) => setContactPhone(formatPhoneInput(event.target.value))}
            />
            <Button
              fullWidth
              variant="secondary"
              loading={busy === "profile"}
              disabled={!profileName.trim() || contactPhone.replace(/[^0-9]/g, "").length !== 11}
              onClick={saveProfile}
            >
              기본 정보 저장
            </Button>
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-ink">정산 계좌</p>
                <p className="mt-1 text-xs text-ink-weak">포인트를 지급받을 계좌를 등록해 주세요.</p>
              </div>
              {profileSummary.payoutAccount && (
                <button
                  type="button"
                  className="text-sm font-semibold text-brand"
                  onClick={() => setEditingAccount((value) => !value)}
                >
                  {editingAccount ? "닫기" : "수정"}
                </button>
              )}
            </div>

            {profileSummary.payoutAccount && !editingAccount ? (
              <div className="rounded-card bg-canvas p-3 text-sm">
                <p className="break-all font-semibold tabular-nums text-ink">
                  {profileSummary.payoutAccount.bankName} {profileSummary.payoutAccount.accountNumber}
                </p>
                <p className="mt-1 text-ink-sub">예금주 {profileSummary.payoutAccount.accountHolder}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-base text-ink outline-none transition focus:border-brand"
                  value={bankName}
                  onChange={(event) => setBankName(event.target.value)}
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
                  onChange={(event) =>
                    setAccountNumber(event.target.value.replace(/[^0-9]/g, "").slice(0, 32))
                  }
                />
                <TextInput
                  placeholder="예금주"
                  value={accountHolder}
                  onChange={(event) => setAccountHolder(event.target.value)}
                />
                <Button
                  fullWidth
                  variant="secondary"
                  loading={busy === "account"}
                  disabled={!bankName || !accountNumber || !accountHolder}
                  onClick={saveAccount}
                >
                  정산 계좌 저장
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
