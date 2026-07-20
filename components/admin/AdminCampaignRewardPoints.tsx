"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import {
  MAX_CAMPAIGN_REWARD_POINTS,
  MIN_CAMPAIGN_REWARD_POINTS,
} from "@/lib/domain/campaign-reward-points";

interface CampaignRewardResponse {
  campaign?: {
    id: string;
    rewardPoints: number;
  };
  error?: {
    message?: string;
  };
}

export function AdminCampaignRewardPoints({
  campaignId,
  initialRewardPoints,
}: {
  campaignId: string;
  initialRewardPoints: number;
}) {
  const router = useRouter();
  const [rewardPoints, setRewardPoints] = useState(String(initialRewardPoints));
  const [savedRewardPoints, setSavedRewardPoints] = useState(initialRewardPoints);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const value = Number(rewardPoints);
    if (
      !Number.isInteger(value) ||
      value < MIN_CAMPAIGN_REWARD_POINTS ||
      value > MAX_CAMPAIGN_REWARD_POINTS
    ) {
      setMessage(null);
      setError("1P 이상 100,000P 이하의 정수로 입력해 주세요.");
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/admin/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rewardPoints: value }),
      });
      const data = (await response.json().catch(() => null)) as CampaignRewardResponse | null;
      if (!response.ok || !data?.campaign) {
        throw new Error(data?.error?.message || "지급 포인트를 저장하지 못했습니다.");
      }
      setRewardPoints(String(data.campaign.rewardPoints));
      setSavedRewardPoints(data.campaign.rewardPoints);
      setMessage("지급 포인트를 저장했습니다.");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "지급 포인트를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-3 rounded-card border border-line bg-canvas p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">캠페인 지급 포인트</p>
          <p className="mt-0.5 text-xs text-ink-weak">
            리뷰어 배정 시 이 금액이 확정됩니다. 현재 저장값{" "}
            <strong className="text-brand">
              {savedRewardPoints.toLocaleString("ko-KR")}P
            </strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative block">
            <span className="sr-only">건당 지급 포인트</span>
            <input
              type="number"
              min={MIN_CAMPAIGN_REWARD_POINTS}
              max={MAX_CAMPAIGN_REWARD_POINTS}
              step={1}
              inputMode="numeric"
              value={rewardPoints}
              onChange={(event) => setRewardPoints(event.target.value)}
              className="h-10 w-36 rounded-btn border border-line bg-surface px-3 pr-8 text-right text-sm font-bold tabular-nums text-ink outline-none focus:border-brand"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-weak">
              P
            </span>
          </label>
          <Button
            type="button"
            variant="secondary"
            loading={saving}
            onClick={save}
            className="h-10 shrink-0 px-4 text-xs"
          >
            저장
          </Button>
        </div>
      </div>
      {message ? <p className="mt-2 text-xs font-semibold text-success">{message}</p> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
