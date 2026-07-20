"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { naverSmartPlaceLink } from "@/lib/domain/naver-smartplace-link";
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
  const [manualUrl, setManualUrl] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

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

  const saveManualUrl = async () => {
    const naverUrl = manualUrl.trim();
    if (!naverUrl) {
      setError("네이버 스마트플레이스 상세 URL을 입력해 주세요.");
      return;
    }

    setManualSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/naver-place`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ naverUrl }),
      });
      const data = (await res.json().catch(() => null)) as (SaveResult & ErrorResult) | null;
      if (!res.ok) throw new Error(data?.error?.message || "네이버 상세 URL을 저장하지 못했습니다.");
      if (!data?.place) throw new Error("네이버 저장 응답이 비어 있습니다.");
      setConnectedPlace(data.place);
      setManualUrl("");
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네이버 상세 URL을 저장하지 못했습니다.");
    } finally {
      setManualSaving(false);
    }
  };

  const connectedUrl = naverSmartPlaceLink({
    url: connectedPlace?.url,
    name: connectedPlace?.name,
    address: connectedPlace?.address,
  });

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
                {connectedUrl ? (
                  <a
                    href={connectedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-line-strong underline-offset-4 transition hover:text-brand hover:decoration-brand"
                  >
                    {connectedPlace.name}
                    <span aria-hidden="true" className="ml-1 text-xs text-brand">
                      ↗
                    </span>
                  </a>
                ) : (
                  connectedPlace.name
                )}{" "}
                {connectedPlace.matchConfidence != null ? (
                  <span className="text-xs font-medium text-brand">{connectedPlace.matchConfidence}% 일치</span>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-ink-weak">
                {[connectedPlace.category, connectedPlace.address].filter(Boolean).join(" · ") || "상세 정보 없음"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-weak">
            {hasGooglePlace
              ? "캠페인 반영 시 Google 장소 기준으로 네이버 후보를 자동 연결합니다."
              : "Google Place가 연결된 캠페인만 네이버 후보를 자동 연결할 수 있습니다."}
          </p>
        )}
      </div>

      <div className="mt-3 rounded-card border border-line bg-surface p-3">
        <p className="text-xs font-semibold text-ink">관리자 보정</p>
        <p className="mt-1 text-xs text-ink-weak">
          네이버 지도에서 매장 상세 화면을 연 뒤 주소창 URL 또는 공유 링크를
          붙여넣으세요. URL에 매장 Place ID 숫자가 포함되어야 합니다.
        </p>
        <p className="mt-1 break-all rounded-[8px] bg-canvas px-2 py-1.5 text-[11px] leading-5 text-ink-weak">
          예: https://map.naver.com/p/entry/place/2059222523
          <br />
          또는 https://pcmap.place.naver.com/restaurant/2059222523/home
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value)}
            placeholder="https://pcmap.place.naver.com/restaurant/..."
            className="h-10 min-w-0 flex-1 rounded-btn border border-line bg-canvas px-3 text-sm text-ink outline-none focus:border-brand"
          />
          <Button
            type="button"
            variant="secondary"
            loading={manualSaving}
            disabled={manualSaving || savingIndex !== null}
            onClick={saveManualUrl}
            className="h-10 shrink-0 px-3 text-xs"
          >
            상세 URL 저장
          </Button>
        </div>
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
                  const link = naverSmartPlaceLink({
                    url: candidate.link,
                    name: candidate.title,
                    address: candidate.roadAddress || candidate.address,
                  });
                  const saved = isSamePlace(connectedPlace, candidate, link);
                  const canConfirmSaved = saved && connectedPlace?.matchStatus === "NEEDS_REVIEW";
                  return (
                    <div key={`${candidate.title}-${index}`} className="rounded-card border border-line bg-surface p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink">
                            {link ? (
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline decoration-line-strong underline-offset-4 transition hover:text-brand hover:decoration-brand"
                              >
                                {candidate.title}
                                <span aria-hidden="true" className="ml-1 text-xs text-brand">
                                  ↗
                                </span>
                              </a>
                            ) : (
                              candidate.title
                            )}{" "}
                            <span className="text-xs font-medium text-brand">{candidate.matchConfidence}% 일치</span>
                          </p>
                          <p className="mt-1 text-xs text-ink-weak">
                            {[candidate.category, candidate.roadAddress || candidate.address].filter(Boolean).join(" · ") ||
                              "주소 정보 없음"}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
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
