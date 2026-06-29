"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";

const PLANS: { key: string; label: string }[] = [
  { key: "BASIC", label: "베이직" },
  { key: "PRO", label: "프로" },
];

export function SubscriptionPanel({
  businessId,
  plan,
}: {
  businessId: string;
  plan: string | null;
}) {
  const [current, setCurrent] = useState<string | null>(plan);
  const [busy, setBusy] = useState<string | null>(null);

  const subscribe = async (p: string) => {
    setBusy(p);
    try {
      const res = await fetch(`/api/business/${businessId}/subscription`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: p }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setCurrent(d.plan);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-weak">구독</p>
        <span className="text-sm text-ink-sub">
          현재 플랜: <b className="text-ink">{current ?? "없음"}</b>
        </span>
      </div>
      <div className="flex gap-2">
        {PLANS.map((p) => (
          <Button
            key={p.key}
            variant={current === p.key ? "primary" : "secondary"}
            loading={busy === p.key}
            onClick={() => subscribe(p.key)}
            className="flex-1"
          >
            {p.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}
