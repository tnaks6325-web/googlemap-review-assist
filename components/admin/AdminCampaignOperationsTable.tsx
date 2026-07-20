"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminCampaignBlogReferences } from "@/components/admin/AdminCampaignBlogReferences";
import { AdminCampaignDraftPreview } from "@/components/admin/AdminCampaignDraftPreview";
import { AdminCampaignDraftGuidance } from "@/components/admin/AdminCampaignDraftGuidance";
import { AdminCampaignNaverCandidates } from "@/components/admin/AdminCampaignNaverCandidates";
import {
  automaticNaverCampaignIds,
  filterAdminCampaignRows,
  operationalCampaignStatus,
  type AdminCampaignStatusFilter,
} from "@/lib/admin-campaign-table";
import { safeGoogleMapsUrl } from "@/lib/domain/google-maps-link";
import type { AdminCampaignRow } from "@/lib/domain/operator-campaigns";

export type AdminCampaignOperationsRow = Omit<AdminCampaignRow, "createdAt"> & {
  createdAt: string;
};

const STATUS_OPTIONS: Array<{
  value: AdminCampaignStatusFilter;
  label: string;
}> = [
  { value: "all", label: "전체 상태" },
  { value: "active", label: "진행 캠페인" },
  { value: "attention", label: "보정 필요" },
  { value: "ready", label: "원고 준비 완료" },
  { value: "scheduled", label: "운영 예정" },
  { value: "daily_full", label: "오늘 마감" },
  { value: "total_full", label: "전체 마감" },
  { value: "ended", label: "운영 종료" },
  { value: "inactive", label: "중지됨" },
];

export function AdminCampaignOperationsTable({
  campaigns,
}: {
  campaigns: AdminCampaignOperationsRow[];
}) {
  const router = useRouter();
  const autoLinkStarted = useRef(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AdminCampaignStatusFilter>("all");
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(
    null,
  );

  const filteredCampaigns = useMemo(
    () => filterAdminCampaignRows(campaigns, query, status),
    [campaigns, query, status],
  );

  useEffect(() => {
    if (autoLinkStarted.current) return;
    autoLinkStarted.current = true;

    const campaignIds = automaticNaverCampaignIds(campaigns);
    if (!campaignIds.length) return;

    let cancelled = false;
    const autoLink = async () => {
      let updated = false;

      for (let index = 0; index < campaignIds.length; index += 3) {
        const batch = campaignIds.slice(index, index + 3);
        const results = await Promise.all(
          batch.map(async (campaignId) => {
            try {
              const response = await fetch(
                `/api/admin/campaigns/${campaignId}/naver-candidates`,
                {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({}),
                },
              );
              if (!response.ok) return false;
              const data = (await response.json().catch(() => null)) as {
                place?: unknown;
              } | null;
              return Boolean(data?.place);
            } catch {
              return false;
            }
          }),
        );
        updated = results.some(Boolean) || updated;
      }

      if (updated && !cancelled) router.refresh();
    };

    void autoLink();
    return () => {
      cancelled = true;
    };
  }, [campaigns, router]);

  return (
    <section>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink">캠페인 목록</h2>
            <span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-bold text-brand">
              {filteredCampaigns.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-weak">
            행을 펼치면 장소 연결, 참고자료 수집, 원고 가이드를 관리할 수 있습니다.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block">
            <span className="sr-only">캠페인 검색</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-weak"
            >
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="m12.5 12.5 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="업체명·주소 검색"
              className="h-10 w-full rounded-[10px] border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/10 sm:w-60"
            />
          </label>
          <label>
            <span className="sr-only">캠페인 상태</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as AdminCampaignStatusFilter)
              }
              className="h-10 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-medium text-ink-sub outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/10 sm:w-40"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1260px] table-fixed border-separate border-spacing-0">
            <caption className="sr-only">
              관리자 캠페인 운영 상태 및 자료 연결 현황
            </caption>
            <colgroup>
              <col className="w-[300px]" />
              <col className="w-[104px]" />
              <col className="w-[150px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[130px]" />
              <col className="w-[80px]" />
              <col className="w-[110px]" />
              <col className="w-[246px]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-alt">
                <TableHeading>캠페인</TableHeading>
                <TableHeading>운영 상태</TableHeading>
                <TableHeading>오늘 배정 / 일 한도</TableHeading>
                <TableHeading>지급</TableHeading>
                <TableHeading>코드</TableHeading>
                <TableHeading>원고 자료</TableHeading>
                <TableHeading>채널 연결</TableHeading>
                <TableHeading>참고자료</TableHeading>
                <TableHeading align="right">관리</TableHeading>
              </tr>
            </thead>
            <tbody>
              {filteredCampaigns.map((campaign) => {
                const campaignStatus = operationalCampaignStatus(campaign);
                const expanded = expandedCampaignId === campaign.id;
                const sourcePercent = Math.min(
                  campaign.draftSourceGroupCount * 25,
                  100,
                );

                return (
                  <CampaignRows
                    key={campaign.id}
                    campaign={campaign}
                    expanded={expanded}
                    sourcePercent={sourcePercent}
                    status={campaignStatus}
                    onToggle={() =>
                      setExpandedCampaignId(expanded ? null : campaign.id)
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredCampaigns.length === 0 ? (
          <div className="border-t border-line px-5 py-12 text-center">
            <p className="font-semibold text-ink">조건에 맞는 캠페인이 없습니다.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
              className="mt-2 text-sm font-semibold text-brand"
            >
              검색 조건 초기화
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-ink-weak">
            <span>
              전체 {campaigns.length}건 중 {filteredCampaigns.length}건
            </span>
            <span>업체명을 기준으로 최신 등록순 표시</span>
          </div>
        )}
      </div>
    </section>
  );
}

function CampaignRows({
  campaign,
  expanded,
  sourcePercent,
  status,
  onToggle,
}: {
  campaign: AdminCampaignOperationsRow;
  expanded: boolean;
  sourcePercent: number;
  status: ReturnType<typeof operationalCampaignStatus>;
  onToggle: () => void;
}) {
  const googleMapsUrl = safeGoogleMapsUrl(campaign.googleMapsUrl);

  return (
    <>
      <tr className="group h-[92px]">
        <td className="border-t border-line px-4 py-4 group-first:border-t-0">
          {googleMapsUrl ? (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${campaign.businessName} Google 지도 열기`}
              className="inline-flex items-center gap-1 font-bold text-ink underline decoration-line-strong underline-offset-4 transition hover:text-brand hover:decoration-brand"
            >
              {campaign.businessName}
              <span aria-hidden="true" className="text-xs text-brand">
                ↗
              </span>
            </a>
          ) : (
            <p className="font-bold text-ink">{campaign.businessName}</p>
          )}
          <p className="mt-1 max-w-[300px] truncate text-xs text-ink-weak">
            {[campaign.category, campaign.address].filter(Boolean).join(" · ") ||
              campaign.campaignName}
          </p>
        </td>
        <TableCell>
          <StatusBadge status={status} />
        </TableCell>
        <TableCell>
          <p className="font-bold tabular-nums text-ink">
            {campaign.assignedTodayCount} / {campaign.dailyQuota ?? "-"}
          </p>
          <p className="mt-1 text-[11px] text-ink-weak">
            오늘 완료 {campaign.completedTodayCount}건
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[11px] text-ink-weak">
            누적 배정 {campaign.assignedCount}/{campaign.totalQuota ?? "-"} · 완료{" "}
            {campaign.completedCount}건
          </p>
        </TableCell>
        <TableCell>
          <p className="font-bold tabular-nums text-ink">
            {campaign.paidPointAmount.toLocaleString("ko-KR")}P
          </p>
        </TableCell>
        <TableCell>
          <p className="font-bold tabular-nums text-ink">
            {campaign.issuedCodeCount.toLocaleString("ko-KR")}개
          </p>
        </TableCell>
        <TableCell>
          <div className="w-24">
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <span
                className={
                  campaign.canGenerateReviewDraft
                    ? "block h-full rounded-full bg-success"
                    : "block h-full rounded-full bg-brand"
                }
                style={{ width: `${sourcePercent}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-ink-weak">
              {campaign.draftSourceGroupCount}/4
              {campaign.canGenerateReviewDraft ? " · 준비 완료" : " · 부족"}
            </p>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex gap-1" aria-label="연결 채널">
            <SourceChip
              label="G"
              title="Google 장소"
              connected={campaign.draftSourceGroups.googlePlace}
            />
            <SourceChip
              label="N"
              title="Naver 장소"
              connected={campaign.draftSourceGroups.naverPlace}
              warning={campaign.naverPlace?.matchStatus === "NEEDS_REVIEW"}
            />
          </div>
        </TableCell>
        <TableCell>
          <p className="font-bold tabular-nums text-ink">
            {campaign.blogReferenceCount + campaign.reviewReferenceCount}건
          </p>
          <p className="mt-1 whitespace-nowrap text-[11px] text-ink-weak">
            블로그 {campaign.blogReferenceCount} · 리뷰{" "}
            {campaign.reviewReferenceCount}
          </p>
        </TableCell>
        <TableCell align="right">
          <div className="flex justify-end gap-1.5">
            <AdminCampaignDraftPreview
              campaignId={campaign.id}
              businessName={campaign.businessName}
            />
            <Link
              href={`/r/${campaign.slug}`}
              target="_blank"
              aria-label={`${campaign.businessName} 참여 페이지 열기`}
              className="inline-flex size-9 items-center justify-center rounded-[9px] border border-line bg-surface text-sm font-bold text-ink-sub transition hover:border-line-strong hover:bg-surface-alt"
            >
              ↗
            </Link>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={`campaign-detail-${campaign.id}`}
              className="h-9 rounded-[9px] border border-line bg-surface px-3 text-xs font-bold text-ink-sub transition hover:border-line-strong hover:bg-surface-alt"
            >
              {expanded ? "접기" : "상세"}
            </button>
          </div>
        </TableCell>
      </tr>
      {expanded ? (
        <tr id={`campaign-detail-${campaign.id}`}>
          <td colSpan={9} className="border-t border-line bg-[#f8fbff] p-4">
            <div className="grid gap-3 xl:grid-cols-3">
              <AdminCampaignNaverCandidates
                campaignId={campaign.id}
                initialPlace={campaign.naverPlace}
                hasGooglePlace={campaign.hasGooglePlace}
              />
              <AdminCampaignBlogReferences
                campaignId={campaign.id}
                initialReferences={campaign.blogReferences}
                initialCount={campaign.blogReferenceCount}
              />
              <AdminCampaignDraftGuidance
                campaignId={campaign.id}
                initialGuidance={campaign.draftGuidance}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function TableHeading({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`h-11 border-b border-line px-4 text-[11px] font-bold text-ink-weak ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`border-t border-line px-4 py-4 group-first:border-t-0 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </td>
  );
}

function StatusBadge({
  status,
}: {
  status: ReturnType<typeof operationalCampaignStatus>;
}) {
  const toneClass =
    status.tone === "warning"
      ? "bg-amber-50 text-amber-700"
      : status.tone === "brand"
        ? "bg-brand-tint text-brand"
        : "bg-surface-alt text-ink-weak";

  return (
    <span
      className={`inline-flex min-h-6 whitespace-nowrap items-center rounded-full px-2 text-[11px] font-bold ${toneClass}`}
    >
      {status.label}
    </span>
  );
}

function SourceChip({
  label,
  title,
  connected,
  warning = false,
}: {
  label: string;
  title: string;
  connected: boolean;
  warning?: boolean;
}) {
  const toneClass = warning
    ? "bg-amber-50 text-amber-700"
    : connected
      ? "bg-success-tint text-success"
      : "bg-surface-alt text-ink-weak";

  return (
    <span
      title={`${title}: ${warning ? "확인 필요" : connected ? "연결됨" : "미연결"}`}
      className={`inline-flex size-7 items-center justify-center rounded-[7px] text-[10px] font-black ${toneClass}`}
    >
      {label}
    </span>
  );
}
