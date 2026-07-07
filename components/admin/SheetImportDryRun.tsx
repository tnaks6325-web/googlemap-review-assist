"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type {
  SheetImportDryRunRow,
  SheetImportDryRunSummary,
  SheetImportNaverPlacePreview,
  SheetImportPlacePreview,
} from "@/lib/domain/google-sheet-import";

interface DryRunResponse {
  dryRun: boolean;
  source: {
    spreadsheetId: string;
    range: string;
  };
  headerRowNumber: number;
  summary: SheetImportDryRunSummary;
  rows: SheetImportDryRunRow[];
  sync?: {
    imported: number;
    updated: number;
    skipped: number;
    errors: Array<{ rowNumber: number; message: string }>;
  } | null;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card bg-canvas px-3 py-2">
      <p className="text-xs text-ink-weak">{label}</p>
      <p className="text-lg font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function googlePlaceLink(place: SheetImportPlacePreview) {
  if (place.url) return place.url;
  return /^https?:\/\//i.test(place.input) ? place.input : null;
}

function safeNaverSmartPlaceUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const isSmartPlaceHost =
      host === "map.naver.com" || host === "place.naver.com" || host === "m.place.naver.com" || host.endsWith(".place.naver.com");
    const hasPlaceId =
      /\/(?:p\/)?(?:entry\/)?place\/\d+/.test(url.pathname) ||
      /\/restaurant\/\d+/.test(url.pathname) ||
      url.searchParams.has("id") ||
      url.searchParams.has("placeId");
    return url.protocol === "https:" && isSmartPlaceHost && hasPlaceId ? url.toString() : null;
  } catch {
    return null;
  }
}

function naverPlaceLink(place: SheetImportNaverPlacePreview) {
  const url = safeNaverSmartPlaceUrl(place.url);
  if (url) return url;
  if (place.placeId) return `https://map.naver.com/p/entry/place/${encodeURIComponent(place.placeId)}`;

  const query = [place.name, place.address, place.query].filter(Boolean).join(" ").trim();
  return query ? `https://map.naver.com/p/search/${encodeURIComponent(query)}` : null;
}

function GooglePlacePreview({ place }: { place: SheetImportPlacePreview }) {
  const isResolved = place.status === "RESOLVED";
  const isFailed = place.status === "FAILED";
  const label = isResolved ? "Google 확인" : isFailed ? "Google 실패" : "수동 확인";
  const tone = isResolved ? "text-success" : isFailed ? "text-danger" : "text-ink-sub";
  const link = googlePlaceLink(place);
  const ratingSummary = [
    place.rating != null ? `${place.rating.toFixed(1)}점` : null,
    place.reviewCount != null ? `리뷰 ${place.reviewCount.toLocaleString()}개` : null,
  ].filter(Boolean);

  return (
    <div className="mt-2 rounded-card bg-canvas px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        {link ? (
          <a className={`shrink-0 font-semibold ${tone}`} href={link} rel="noreferrer" target="_blank">
            {label}
          </a>
        ) : (
          <p className={`shrink-0 font-semibold ${tone}`}>{label}</p>
        )}
        {link ? (
          <a className="min-w-0 flex-1 truncate font-medium text-ink hover:text-primary" href={link} rel="noreferrer" target="_blank">
            {place.name || "-"}
          </a>
        ) : (
          <p className="min-w-0 flex-1 truncate font-medium text-ink">{place.name || "-"}</p>
        )}
        {link && (
          <a className="shrink-0 font-semibold text-primary" href={link} rel="noreferrer" target="_blank">
            지도
          </a>
        )}
      </div>
      {ratingSummary.length > 0 && <p className="mt-1 truncate text-ink-sub">{ratingSummary.join(" · ")}</p>}
      {place.address && <p className="mt-1 truncate text-ink-sub">{place.address}</p>}
    </div>
  );
}

function NaverPlacePreview({ place }: { place: SheetImportNaverPlacePreview }) {
  const isFound = place.status === "FOUND";
  const isFailed = place.status === "FAILED";
  const label = isFound ? "Naver 확인" : isFailed ? "Naver 실패" : "Naver 후보 확인";
  const tone = isFound ? "text-success" : isFailed ? "text-danger" : "text-ink-sub";
  const link = naverPlaceLink(place);
  const confidenceText = place.matchConfidence != null ? `일치 ${place.matchConfidence}%` : null;
  const confidenceTone =
    place.matchConfidence != null && place.matchConfidence >= 70 ? "font-semibold text-success" : "text-ink-sub";
  const meta = [place.category, place.address].filter(Boolean);

  return (
    <div className="mt-2 rounded-card bg-canvas px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        {link ? (
          <a className={`shrink-0 font-semibold ${tone}`} href={link} rel="noreferrer" target="_blank">
            {label}
          </a>
        ) : (
          <p className={`shrink-0 font-semibold ${tone}`}>{label}</p>
        )}
        {link ? (
          <a className="min-w-0 flex-1 truncate font-medium text-ink hover:text-primary" href={link} rel="noreferrer" target="_blank">
            {place.name || place.query || "-"}
          </a>
        ) : (
          <p className="min-w-0 flex-1 truncate font-medium text-ink">{place.name || place.query || "-"}</p>
        )}
        {link && (
          <a className="shrink-0 font-semibold text-primary" href={link} rel="noreferrer" target="_blank">
            지도
          </a>
        )}
      </div>
      {(confidenceText || meta.length > 0) && (
        <p className="mt-1 truncate text-ink-sub">
          {confidenceText && <span className={confidenceTone}>{confidenceText}</span>}
          {confidenceText && meta.length > 0 ? " · " : ""}
          {meta.join(" · ")}
        </p>
      )}
      {place.message && <p className="mt-1 truncate text-ink-weak">{place.message}</p>}
    </div>
  );
}

function RowStatus({ row }: { row: SheetImportDryRunRow }) {
  const isReady = row.status === "READY";
  const visibleErrors = row.errors.slice(0, 1);
  const visibleWarnings = row.warnings.slice(0, 1);

  return (
    <div className="rounded-card border border-line bg-surface px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="shrink-0 text-xs font-semibold text-ink-weak">{row.rowNumber}행</p>
            <p className="truncate text-sm font-semibold text-ink">{row.businessName || "(업체명 없음)"}</p>
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-sub">
            {row.advertiserName || row.searchKeyword || row.landingUrl}
          </p>
        </div>
        <span className={isReady ? "shrink-0 text-xs font-semibold text-success" : "shrink-0 text-xs font-semibold text-danger"}>
          {isReady ? "정상" : "오류"}
        </span>
      </div>
      {visibleErrors.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-danger">
          {visibleErrors.map((error) => (
            <li key={error} className="truncate">
              - {error}
            </li>
          ))}
        </ul>
      )}
      {visibleWarnings.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-ink-weak">
          {visibleWarnings.map((warning) => (
            <li key={warning} className="truncate">
              - {warning}
            </li>
          ))}
        </ul>
      )}
      {row.googlePlace && <GooglePlacePreview place={row.googlePlace} />}
      {row.naverPlace && <NaverPlacePreview place={row.naverPlace} />}
    </div>
  );
}

export function SheetImportDryRun() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DryRunResponse | null>(null);

  const runSync = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sheet-imports/google-map-review/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "시트 처리를 완료하지 못했습니다");

      if (dryRun) {
        setResult(data as DryRunResponse);
      } else {
        setResult(null);
        window.location.reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "시트 처리 중 오류가 발생했습니다");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">시트 검사</p>
          <p className="mt-1 text-sm text-ink-weak">필수값과 Google Places 연결만 빠르게 확인합니다.</p>
        </div>
        <div className="flex gap-2">
          <Button className="sm:w-auto" variant="secondary" loading={busy} onClick={() => runSync(true)}>
            시트 검사
          </Button>
          <Button className="sm:w-auto" loading={busy} onClick={() => runSync(false)}>
            캠페인 반영
          </Button>
        </div>
      </div>

      {error && <p className="rounded-card border border-line bg-canvas p-3 text-sm text-danger">{error}</p>}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="검사" value={result.summary.totalRows} />
            <Metric label="정상" value={result.summary.readyRows} />
            <Metric label="오류" value={result.summary.errorRows} />
            <Metric label="주의" value={result.summary.warningRows} />
          </div>
          {result.sync?.errors.length ? (
            <ul className="space-y-1 rounded-card border border-line bg-canvas p-3 text-sm text-ink-weak">
              {result.sync.errors.slice(0, 5).map((syncError) => (
                <li key={`${syncError.rowNumber}:${syncError.message}`}>
                  {syncError.rowNumber}행 - {syncError.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="space-y-1.5">
            {result.rows.slice(0, 12).map((row) => (
              <RowStatus key={row.rowNumber} row={row} />
            ))}
            {result.rows.length > 12 && (
              <p className="text-center text-xs text-ink-weak">나머지 {result.rows.length - 12}개 행은 생략했습니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
