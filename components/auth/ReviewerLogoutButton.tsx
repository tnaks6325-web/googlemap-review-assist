"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReviewerLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/reviewer/logout", { method: "POST" });
      if (!response.ok) throw new Error("로그아웃에 실패했어요. 잠시 후 다시 시도해 주세요.");

      window.google?.accounts?.id?.disableAutoSelect?.();
      router.replace("/campaigns");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "로그아웃에 실패했어요.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 pt-7 text-center">
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="text-sm font-medium text-ink-weak underline decoration-line underline-offset-4 transition hover:text-ink-sub disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "로그아웃 중..." : "로그아웃"}
      </button>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
