"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface ResetResult {
  resetCount: number;
  cooldownDays: number;
}

interface AdminReviewerCooldownResetProps {
  reviewerId: string;
  reviewerName: string;
}

export function AdminReviewerCooldownReset({
  reviewerId,
  reviewerName,
}: AdminReviewerCooldownResetProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetCooldown = async () => {
    const confirmed = window.confirm(
      `${reviewerName} 리뷰어의 최근 7일 동일 장소 참여 제한을 해제할까요? 적립금, 정산, 검수 기록은 변경되지 않습니다.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/reviewers/cooldown-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewerId }),
      });
      const result = (await response.json().catch(() => ({}))) as ResetResult & {
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(result.error?.message ?? "참여 제한을 해제하지 못했습니다.");
      }

      setMessage(
        result.resetCount > 0
          ? `최근 참여 ${result.resetCount}건의 ${result.cooldownDays}일 제한을 해제했습니다.`
          : "해제할 최근 참여 이력이 없습니다.",
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "참여 제한을 해제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        className="h-9 whitespace-nowrap px-3 text-xs"
        loading={busy}
        onClick={resetCooldown}
      >
        7일 제한 해제
      </Button>
      {message ? <p className="max-w-44 text-right text-xs text-brand">{message}</p> : null}
      {error ? <p className="max-w-44 text-right text-xs text-danger">{error}</p> : null}
    </div>
  );
}
