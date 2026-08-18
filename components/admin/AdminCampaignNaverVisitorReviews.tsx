"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

type Preview = {
  ordinal: number;
  authorMasked: string | null;
  content: string;
  rating: number | null;
  visitDate: string | null;
  verificationMethod: string | null;
  keywords: string[];
  hasMedia: boolean;
};

type Result = {
  run: {
    status: string;
    placeId: string;
    placeName: string | null;
    errorMessage: string | null;
    collectedAt: string | null;
    previews: Preview[];
  };
};

const SUCCESS_LABEL: Record<string, string> = {
  SUCCESS: "수집 완료",
  NO_REVIEWS: "공개 미리보기 없음",
  BLOCKED: "접근 제한 감지",
  CAPTCHA_REQUIRED: "CAPTCHA 감지",
  PAGE_CHANGED: "화면 구조 변경",
  TIMEOUT: "시간 초과",
  FAILED: "수집 실패",
};

export function AdminCampaignNaverVisitorReviews({ campaignId, initialPlaceId, initialRun }: { campaignId: string; initialPlaceId?: string | null; initialRun?: Result["run"] | null }) {
  const [input, setInput] = useState(initialPlaceId ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result["run"] | null>(initialRun ?? null);
  const [error, setError] = useState<string | null>(null);

  const collect = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/campaigns/${campaignId}/naver-visitor-reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ naverPlaceInput: input }),
      });
      const data = await response.json().catch(() => null) as Result & { error?: { message?: string } };
      if (!response.ok || !data?.run) throw new Error(data?.error?.message || "방문자리뷰를 수집하지 못했습니다.");
      setResult(data.run);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "방문자리뷰를 수집하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-card border border-line bg-canvas p-3" aria-label="네이버 방문자리뷰 원고 참고자료">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">네이버 방문자리뷰 · 원고 참고자료</p>
          <p className="mt-1 text-xs leading-5 text-ink-weak">추천순 공개 미리보기만 최대 10건 수집합니다. 로그인·더보기·우회는 사용하지 않습니다.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="네이버 플레이스 URL 또는 숫자 Place ID"
          className="h-10 min-w-0 flex-1 rounded-btn border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-brand"
          aria-label="네이버 플레이스 URL 또는 ID"
        />
        <Button type="button" variant="secondary" loading={loading} disabled={loading || !input.trim()} onClick={collect} className="h-10 shrink-0 px-3 text-xs">
          방문자리뷰 수집
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {result ? (
        <div className="mt-3 rounded-card border border-line bg-surface p-3">
          <p className="text-sm font-semibold text-ink">
            {SUCCESS_LABEL[result.status] ?? result.status}
            {result.placeName ? ` · ${result.placeName}` : ""}
          </p>
          {result.errorMessage ? <p className="mt-1 text-xs text-danger">{result.errorMessage}</p> : null}
          {result.previews.length ? (
            <ol className="mt-3 space-y-2">
              {result.previews.map((preview) => (
                <li key={preview.ordinal} className="rounded-[10px] border border-line bg-canvas p-3 text-sm text-ink-sub">
                  <p className="text-xs font-semibold text-ink-weak">{preview.authorMasked ?? "작성자 비공개"}{preview.rating ? ` · ${preview.rating}점` : ""}{preview.visitDate ? ` · ${preview.visitDate}` : ""}</p>
                  <p className="mt-1 leading-6">{preview.content}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
