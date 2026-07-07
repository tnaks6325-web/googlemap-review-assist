"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { NaverCandidate } from "@/lib/domain/external-place-providers";
import type { AdminConnectedNaverPlace } from "@/lib/domain/operator-campaigns";

interface CandidateResult {
  candidates: NaverCandidate[];
  providerConfigured: boolean;
  query: string;
}

interface ErrorResult {
  error?: {
    message?: string;
  };
}

interface SaveResult {
  place: AdminConnectedNaverPlace;
}

function safeExternalUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isSmartPlaceHost =
      host === "map.naver.com" || host === "place.naver.com" || host === "m.place.naver.com" || host.endsWith(".place.naver.com");
    const hasPlaceId =
      /\/(?:p\/)?(?:entry\/)?place\/\d+/.test(parsed.pathname) ||
      /\/restaurant\/\d+/.test(parsed.pathname) ||
      parsed.searchParams.has("id") ||
      parsed.searchParams.has("placeId");
    return parsed.protocol === "https:" && isSmartPlaceHost && hasPlaceId ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isSamePlace(place: AdminConnectedNaverPlace | null, candidate: NaverCandidate, link: string | null) {
  if (!place) return false;
  if (link && place.url === link) return true;
  return place.name === candidate.title;
}

function statusLabel(place: AdminConnectedNaverPlace | null) {
  if (!place) return "미연결";
  return place.matchStatus === "NEEDS_REVIEW" ? "자동 후보 확인 필요" : "연결됨";
}

function statusClass(place: AdminConnectedNaverPlace | null) {
  if (!place) return "text-ink-weak";
  return place.matchStatus === "NEEDS_REVIEW" ? "text-danger" : "text-brand";
}

export function AdminCampaignNaverCandidates({
  campaignId,
  initialPlace,
  hasGooglePlace,
}: {
  campaignId: string;
  initialPlace: AdminConnectedNaverPlace | null;
  hasGooglePlace: boolean;
}) {
  const [result, setResult] = useState<CandidateResult | null>(null);
  const [connectedPlace, setConnectedPlace] = useState<AdminConnectedNaverPlace | null>(initialPlace);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  const loadCandidates = async () => {
    if (!hasGooglePlace) {
      setError("Google Place 연결이 있어야 네이버 후보를 자동으로 찾을 수 있습니다.");
      return;
    }
    setEditing(true);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/naver-candidates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as (CandidateResult & ErrorResult) | null;
      if (!res.ok) throw new Error(data?.error?.message || "네이버 후보를 불러오지 못했습니다.");
      if (!data) throw new Error("네이버 후보 응답이 비어 있습니다.");
      setResult({
        candidates: data.candidates ?? [],
        providerConfigured: Boolean(data.providerConfigured),
        query: data.query ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "네이버 후보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const saveCandidate = async (candidate: NaverCandidate, index: number) => {
    setSavingIndex(index);
    setError(null);

    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/naver-place`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidate }),
      });
      const data = (await res.json().catch(() => null)) as (SaveResult & ErrorResult) | null;
      if (!res.ok) throw new Error(data?.error?.message || "네이버 플레이스를 저장하지 못했습니다.");
      if (!data?.place) throw new Error("네이버 저장 응답이 비어 있습니다.");
      setConnectedPlace(data.place);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네이버 플레이스를 저장하지 못했습니다.");
    } finally {
      setSavingIndex(null);
    }
  };

  const connectedUrl = safeExternalUrl(connectedPlace?.url);

  return (
    <div className="rounded-card border border-line bg-canvas p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">네이버 플레이스</p>
          <p className={`mt-0.5 text-xs font-semibold ${statusClass(connectedPlace)}`}>{statusLabel(connectedPlace)}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          loading={loading}
          onClick={loadCandidates}
          disabled={!hasGooglePlace && !connectedPlace}
          className="h-10 shrink-0 px-3 text-xs"
        >
          {connectedPlace ? "수정" : hasGooglePlace ? "자동 연결 재시도" : "Google 장소 없음"}
        </Button>
      </div>

      <div className="mt-3 rounded-card border border-line bg-surface p-3">
        {connectedPlace ? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">
                {connectedPlace.name}{" "}
                {connectedPlace.matchConfidence != null ? (
                  <span className="text-xs font-medium text-brand">{connectedPlace.matchConfidence}% 일치</span>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-ink-weak">
                {[connectedPlace.category, connectedPlace.address].filter(Boolean).join(" · ") || "상세 정보 없음"}
              </p>
            </div>
            {connectedUrl ? (
              <a href={connectedUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-brand">
                열기
              </a>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-weak">
            {hasGooglePlace
              ? "캠페인 반영 시 Google 장소 기준으로 네이버 후보를 자동 연결합니다."
              : "Google Place가 연결된 캠페인만 네이버 후보를 자동 연결할 수 있습니다."}
          </p>
        )}
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      {editing ? (
        <div className="mt-3 space-y-2">
          {result && !result.providerConfigured ? (
            <p className="rounded-card border border-line bg-surface p-3 text-sm text-ink-weak">
              NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 설정이 필요합니다.
            </p>
          ) : null}

          {loading && !result ? (
            <p className="rounded-card border border-line bg-surface p-3 text-sm text-ink-weak">네이버 후보를 확인하고 있습니다.</p>
          ) : null}

          {result?.providerConfigured ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-ink-weak">검색어: {result.query || "-"}</p>
                <Button type="button" variant="text" onClick={() => setEditing(false)} className="h-8 px-2 text-xs">
                  닫기
                </Button>
              </div>

              {result.candidates.length ? (
                result.candidates.map((candidate, index) => {
                  const link = safeExternalUrl(candidate.link);
                  const saved = isSamePlace(connectedPlace, candidate, link);
                  const canConfirmSaved = saved && connectedPlace?.matchStatus === "NEEDS_REVIEW";
                  return (
                    <div key={`${candidate.title}-${index}`} className="rounded-card border border-line bg-surface p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink">
                            {candidate.title}{" "}
                            <span className="text-xs font-medium text-brand">{candidate.matchConfidence}% 일치</span>
                          </p>
                          <p className="mt-1 text-xs text-ink-weak">
                            {[candidate.category, candidate.roadAddress || candidate.address].filter(Boolean).join(" · ") ||
                              "주소 정보 없음"}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          {link ? (
                            <a href={link} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand">
                              열기
                            </a>
                          ) : null}
                          <Button
                            type="button"
                            variant={saved && !canConfirmSaved ? "text" : "secondary"}
                            loading={savingIndex === index}
                            disabled={(saved && !canConfirmSaved) || savingIndex !== null}
                            onClick={() => saveCandidate(candidate, index)}
                            className="h-9 px-3 text-xs"
                          >
                            {saved ? (canConfirmSaved ? "이 후보 확정" : "저장됨") : "이 후보로 변경"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-card border border-line bg-surface p-3 text-sm text-ink-weak">후보가 없습니다.</p>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
