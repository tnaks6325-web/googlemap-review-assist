"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function RandomCampaignEntryButton({
  disabled,
}: {
  disabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assignRandomCampaign() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/reviewer/campaigns/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "캠페인을 배정하지 못했어요.");
      }
      if (!data.assignmentId) {
        throw new Error("지금 참여 가능한 캠페인이 없어요.");
      }

      router.push("/r/demo");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "캠페인을 배정하지 못했어요.",
      );
      setBusy(false);
    }
  }

  return (
    <div>
      <Button
        fullWidth
        loading={busy}
        disabled={disabled}
        onClick={assignRandomCampaign}
      >
        참여하기
      </Button>
      {error ? (
        <p className="mt-2 text-center text-xs text-danger">{error}</p>
      ) : null}
    </div>
  );
}
