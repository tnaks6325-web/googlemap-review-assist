"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/ui";

interface ResetResult {
  resetCount: number;
  cooldownDays: number;
}

export function AdminReviewerCooldownReset() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetCooldown = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/reviewers/cooldown-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = (await response.json().catch(() => ({}))) as ResetResult & {
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(result.error?.message ?? "제한 해제에 실패했습니다.");
      }

      setMessage(
        `${result.resetCount}건의 최근 참여 이력을 ${result.cooldownDays}일 제한 계산에서 제외했습니다.`,
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "제한 해제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-card border border-line bg-surface p-5">
      <div>
        <h1 className="text-lg font-bold text-ink">리뷰어 7일 참여 제한 해제</h1>
        <p className="mt-1 text-sm text-ink-sub">
          최근 7일 내 동일 Google 장소 참여 이력만 제한 계산에서 제외합니다.
        </p>
        <p className="mt-1 text-xs text-ink-weak">
          적립금, 정산 요청, 검수 캡처와 캠페인 데이터는 변경하지 않습니다.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <TextInput
          type="email"
          value={email}
          placeholder="리뷰어 Google 계정 이메일"
          onChange={(event) => setEmail(event.target.value)}
          className="flex-1"
        />
        <Button
          className="h-[48px] whitespace-nowrap text-sm"
          loading={busy}
          disabled={!email.trim()}
          onClick={resetCooldown}
        >
          7일 제한 해제
        </Button>
      </div>

      {message ? <p className="rounded-btn bg-brand-tint p-3 text-sm text-brand">{message}</p> : null}
      {error ? <p className="rounded-btn bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
