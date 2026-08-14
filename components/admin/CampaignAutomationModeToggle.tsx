"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CampaignAutomationModeToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const update = async (next: boolean) => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/campaign-automation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const body = (await response.json().catch(() => null)) as { enabled?: boolean; error?: { message?: string } } | null;
      if (!response.ok || typeof body?.enabled !== "boolean") {
        setMessage(body?.error?.message ?? "자동 모드를 변경하지 못했습니다.");
        return;
      }
      setValue(body.enabled);
      setMessage(body.enabled ? "자동 모드를 켰습니다." : "수동 모드로 전환했습니다. 기존 자동 작업은 중지됩니다.");
      router.refresh();
    } catch {
      setMessage("네트워크 오류로 자동 모드를 변경하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return <section className="mb-5 flex flex-col gap-3 rounded-[13px] border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 className="text-base font-bold text-ink">캠페인 처리 모드</h2>
      <p className="mt-1 text-xs text-ink-weak">자동 모드는 시트 기반 캠페인 발견·세팅을 실행합니다. 수동 모드에서는 자동 작업을 멈추고 개별 수동 세팅만 실행할 수 있습니다.</p>
      {message ? <p role="status" className="mt-2 text-xs font-semibold text-ink-sub">{message}</p> : null}
    </div>
    <div className="inline-flex shrink-0 rounded-[10px] border border-line bg-surface-alt p-1" role="group" aria-label="캠페인 처리 모드">
      <button type="button" onClick={() => void update(true)} disabled={saving || value} aria-pressed={value} className="h-9 rounded-[7px] px-4 text-xs font-bold transition aria-pressed:bg-brand aria-pressed:text-white disabled:cursor-not-allowed disabled:opacity-60">자동 ON</button>
      <button type="button" onClick={() => void update(false)} disabled={saving || !value} aria-pressed={!value} className="h-9 rounded-[7px] px-4 text-xs font-bold transition aria-pressed:bg-ink aria-pressed:text-white disabled:cursor-not-allowed disabled:opacity-60">수동 OFF</button>
    </div>
  </section>;
}
