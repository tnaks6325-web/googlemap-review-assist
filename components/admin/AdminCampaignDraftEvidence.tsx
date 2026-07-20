"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

type EvidenceStatus = "PENDING" | "APPROVED" | "REJECTED";

interface EvidenceCard {
  id: string;
  facet: string;
  fact: string;
  sourceType: string;
  sourceExcerpt: string;
  status: EvidenceStatus;
}

interface EvidenceResponse {
  evidence: EvidenceCard[];
  readiness: {
    approvedCount: number;
    approvedFacetCount: number;
    pendingCount: number;
    rejectedCount: number;
    ready: boolean;
  };
  error?: { message?: string };
}

const FACET_LABELS: Record<string, string> = {
  MENU_PRODUCT: "메뉴·상품",
  SPACE: "공간·시설",
  ACCESS: "접근성",
  SERVICE_INFO: "서비스 정보",
  OPERATIONS: "운영 정보",
  OTHER: "기타",
};

export function AdminCampaignDraftEvidence({ campaignId }: { campaignId: string }) {
  const [result, setResult] = useState<EvidenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/campaigns/${campaignId}/draft-evidence`)
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as EvidenceResponse | null;
        if (!response.ok || !data) throw new Error(data?.error?.message || "사실 카드를 불러오지 못했습니다.");
        if (!cancelled) setResult(data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "사실 카드를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const analyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/campaigns/${campaignId}/draft-evidence`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as EvidenceResponse | null;
      if (!response.ok || !data) throw new Error(data?.error?.message || "캠페인 자료를 분석하지 못했습니다.");
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "캠페인 자료를 분석하지 못했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  const decide = async (id: string, status: EvidenceStatus) => {
    setUpdatingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/campaigns/${campaignId}/draft-evidence`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decisions: [{ id, status }] }),
      });
      const data = (await response.json().catch(() => null)) as EvidenceResponse | null;
      if (!response.ok || !data) throw new Error(data?.error?.message || "사실 카드 상태를 저장하지 못했습니다.");
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "사실 카드 상태를 저장하지 못했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="mt-3 rounded-card border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink">원고 사실 카드</p>
          <p className="mt-1 text-xs leading-5 text-ink-weak">
            플레이스·리뷰·블로그 자료에서 확인되는 사실만 추출합니다. 승인한 카드만 원고에 사용됩니다.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          loading={analyzing}
          onClick={analyze}
          className="h-9 shrink-0 px-3 text-xs"
        >
          자료 분석
        </Button>
      </div>

      {loading ? <p className="mt-3 text-xs text-ink-weak">사실 카드를 불러오는 중…</p> : null}
      {result ? (
        <>
          <div
            className={`mt-3 rounded-[9px] border p-2.5 text-xs ${
              result.readiness.ready
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            승인 {result.readiness.approvedCount}개 · 분류 {result.readiness.approvedFacetCount}종
            {!result.readiness.ready ? " — 25개 다양성 품질을 위해 승인 6개·분류 3종 이상을 권장합니다." : ""}
          </div>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {result.evidence.map((card) => (
              <div key={card.id} className="rounded-[9px] border border-line bg-canvas p-2.5">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded-full bg-brand-tint px-2 py-0.5 font-semibold text-brand">
                    {FACET_LABELS[card.facet] ?? card.facet}
                  </span>
                  <span className="text-ink-weak">{card.sourceType}</span>
                  <span className="ml-auto font-semibold text-ink-sub">{card.status}</span>
                </div>
                <p className="mt-2 text-sm leading-5 text-ink">{card.fact}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-ink-weak">
                  근거: {card.sourceExcerpt}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    disabled={updatingId === card.id}
                    onClick={() => decide(card.id, "APPROVED")}
                    className="h-8 rounded-[8px] border border-emerald-200 px-2.5 text-[11px] font-bold text-emerald-700 disabled:opacity-50"
                  >
                    승인
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === card.id}
                    onClick={() => decide(card.id, "REJECTED")}
                    className="h-8 rounded-[8px] border border-red-200 px-2.5 text-[11px] font-bold text-danger disabled:opacity-50"
                  >
                    반려
                  </button>
                </div>
              </div>
            ))}
            {result.evidence.length === 0 ? (
              <p className="py-3 text-center text-xs text-ink-weak">자료 분석을 실행해 사실 카드를 만들어 주세요.</p>
            ) : null}
          </div>
        </>
      ) : null}
      {error ? <p className="mt-3 text-xs font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
