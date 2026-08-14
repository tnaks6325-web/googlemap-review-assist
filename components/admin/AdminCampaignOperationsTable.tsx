"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminCampaignBlogReferences } from "@/components/admin/AdminCampaignBlogReferences";
import { AdminCampaignDraftPreview } from "@/components/admin/AdminCampaignDraftPreview";
import { AdminCampaignDraftGuidance } from "@/components/admin/AdminCampaignDraftGuidance";
import { AdminCampaignNaverCandidates } from "@/components/admin/AdminCampaignNaverCandidates";
import { AdminCampaignRewardPoints } from "@/components/admin/AdminCampaignRewardPoints";
import { AdminCampaignReviewSubmissions } from "@/components/admin/AdminCampaignReviewSubmissions";
import { useAdminMobileWorkspace } from "@/components/admin/useAdminMobileWorkspace";
import { Button } from "@/components/ui";
import {
  adminCampaignAutomationPlan,
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

function formatCampaignPeriod(startDate: string | null, endDate: string | null) {
  const format = (value: string) => value.replaceAll("-", ".");
  if (startDate && endDate) return `${format(startDate)} ~ ${format(endDate)}`;
  if (startDate) return `${format(startDate)} ~ 종료일 미정`;
  if (endDate) return `시작일 미정 ~ ${format(endDate)}`;
  return "기간 미설정";
}

async function requestNaverAutoLink(campaignId: string) {
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
}

async function requestBlogReferenceCollection(campaignId: string) {
  try {
    const response = await fetch(
      `/api/admin/campaigns/${campaignId}/blog-references`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    if (!response.ok) return false;
    const data = (await response.json().catch(() => null)) as {
      providerConfigured?: boolean;
      totalCount?: number;
    } | null;
    return Boolean(data?.providerConfigured && Number(data.totalCount) > 0);
  } catch {
    return false;
  }
}

export function AdminCampaignOperationsTable({
  campaigns,
  automationLocked = false,
  automationEnabled = false,
}: {
  campaigns: AdminCampaignOperationsRow[];
  automationLocked?: boolean;
  automationEnabled?: boolean;
}) {
  const router = useRouter();
  const autoLinkStarted = useRef(false);
  const autoLinkPromise = useRef<Promise<number> | null>(null);
  const automationRunning = useRef(false);
  const topTableScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomTableScrollRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AdminCampaignStatusFilter>("all");
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationProgress, setAutomationProgress] = useState<string | null>(
    null,
  );
  const [automationMessage, setAutomationMessage] = useState<{
    text: string;
    hasError: boolean;
  } | null>(null);
  const [manualSetupCampaignId, setManualSetupCampaignId] = useState<string | null>(null);
  const [automationToggleCampaignId, setAutomationToggleCampaignId] = useState<string | null>(null);
  const [campaignAutomationEnabled, setCampaignAutomationEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign.automationEnabled])),
  );
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(
    null,
  );
  const mobileWorkspace = useAdminMobileWorkspace();

  const automationCampaigns = useMemo(
    () => campaigns.map((campaign) => ({
      ...campaign,
      automationEnabled: campaignAutomationEnabled[campaign.id] ?? campaign.automationEnabled,
    })),
    [campaignAutomationEnabled, campaigns],
  );

  const filteredCampaigns = useMemo(
    () => filterAdminCampaignRows(campaigns, query, status),
    [campaigns, query, status],
  );

  const syncTableScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (target && target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
  };

  const runNaverAutoLink = useCallback((campaignIds: string[]) => {
    if (autoLinkPromise.current) return autoLinkPromise.current;

    const promise = (async () => {
      let savedCount = 0;
      for (const campaignId of campaignIds) {
        if (await requestNaverAutoLink(campaignId)) savedCount += 1;
      }
      return savedCount;
    })();

    autoLinkPromise.current = promise;
    void promise.finally(() => {
      if (autoLinkPromise.current === promise) autoLinkPromise.current = null;
    });
    return promise;
  }, []);

  useEffect(() => {
    if (automationLocked || !automationEnabled) return;
    if (autoLinkStarted.current) return;
    autoLinkStarted.current = true;

    const campaignIds = automaticNaverCampaignIds(automationCampaigns);
    if (!campaignIds.length) return;

    let cancelled = false;
    void runNaverAutoLink(campaignIds).then((savedCount) => {
      if (savedCount > 0 && !cancelled && !automationRunning.current) {
        router.refresh();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [automationCampaigns, automationEnabled, automationLocked, router, runNaverAutoLink]);

  const runAllAutomation = async () => {
    if (automationLocked || !automationEnabled) return;
    const plan = adminCampaignAutomationPlan(automationCampaigns);
    automationRunning.current = true;
    setAutomationLoading(true);
    setAutomationMessage(null);
    setAutomationProgress("네이버 Place ID 자동보정 중");

    try {
      const savedNaverCount = await runNaverAutoLink(
        plan.naverCampaignIds,
      );
      let collectedCount = 0;
      let failedCount = 0;

      for (let index = 0; index < plan.referenceCampaignIds.length; index += 1) {
        setAutomationProgress(
          `참고자료 수집 중 ${index + 1}/${plan.referenceCampaignIds.length}`,
        );
        const success = await requestBlogReferenceCollection(
          plan.referenceCampaignIds[index],
        );
        if (success) collectedCount += 1;
        else failedCount += 1;
      }

      setAutomationMessage({
        text: `네이버 ${savedNaverCount}건 자동보정 · 참고자료 ${collectedCount}개 캠페인 수집 완료${
          failedCount ? ` · 실패 ${failedCount}건` : ""
        }`,
        hasError: failedCount > 0,
      });
      router.refresh();
    } finally {
      automationRunning.current = false;
      setAutomationLoading(false);
      setAutomationProgress(null);
    }
  };

  const runManualSetup = async (campaignId: string) => {
    if (automationLocked) return;
    setManualSetupCampaignId(campaignId);
    setAutomationMessage(null);
    try {
      const response = await fetch(`/api/admin/campaigns/${campaignId}/manual-setup`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        setAutomationMessage({
          text: body?.error?.message ?? "수동 세팅 작업을 시작하지 못했습니다.",
          hasError: true,
        });
        return;
      }
      setAutomationMessage({
        text: "수동 세팅 작업을 시작했습니다. 자동화 상태에서 진행 상황을 확인할 수 있습니다.",
        hasError: false,
      });
      router.refresh();
    } catch {
      setAutomationMessage({ text: "네트워크 오류로 수동 세팅을 시작하지 못했습니다.", hasError: true });
    } finally {
      setManualSetupCampaignId(null);
    }
  };

  const toggleCampaignAutomation = async (campaign: AdminCampaignOperationsRow) => {
    const current = campaignAutomationEnabled[campaign.id] ?? campaign.automationEnabled;
    const next = !current;
    setAutomationToggleCampaignId(campaign.id);
    setAutomationMessage(null);
    try {
      const response = await fetch(`/api/admin/campaigns/${campaign.id}/automation`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const body = (await response.json().catch(() => null)) as {
        campaign?: { automationEnabled?: boolean };
        error?: { message?: string };
      } | null;
      if (!response.ok || typeof body?.campaign?.automationEnabled !== "boolean") {
        setAutomationMessage({
          text: body?.error?.message ?? "캠페인 자동화를 변경하지 못했습니다.",
          hasError: true,
        });
        return;
      }
      setCampaignAutomationEnabled((values) => ({ ...values, [campaign.id]: body.campaign!.automationEnabled! }));
      setAutomationMessage({
        text: body.campaign.automationEnabled ? `${campaign.businessName} 자동화를 켰습니다.` : `${campaign.businessName} 자동화를 껐습니다. 수동 세팅은 계속 사용할 수 있습니다.`,
        hasError: false,
      });
      router.refresh();
    } catch {
      setAutomationMessage({ text: "네트워크 오류로 캠페인 자동화를 변경하지 못했습니다.", hasError: true });
    } finally {
      setAutomationToggleCampaignId(null);
    }
  };

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
          {automationMessage ? (
            <p
              className={`mt-1 text-xs font-semibold ${
                automationMessage.hasError ? "text-danger" : "text-success"
              }`}
            >
              {automationMessage.text}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            loading={automationLoading}
            disabled={automationLocked || !automationEnabled || automationLoading || campaigns.length === 0}
            onClick={runAllAutomation}
            className="h-10 shrink-0 whitespace-nowrap px-3 text-xs"
          >
            {automationProgress ?? "원클릭 세팅"}
          </Button>
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
        {mobileWorkspace ? <div className="space-y-2.5 p-3">
          {filteredCampaigns.map((campaign) => {
            const campaignStatus = operationalCampaignStatus(campaign);
            const expanded = expandedCampaignId === campaign.id;
            const sourcePercent = Math.min(campaign.draftSourceGroupCount * 25, 100);

            return (
              <MobileCampaignCard
                key={campaign.id}
                campaign={campaign}
                expanded={expanded}
                sourcePercent={sourcePercent}
                status={campaignStatus}
                automationLocked={automationLocked}
                manualSetupEligible={campaign.manualSetupEligible}
                manualSetupLoading={manualSetupCampaignId === campaign.id}
                automationEnabled={campaignAutomationEnabled[campaign.id] ?? campaign.automationEnabled}
                automationToggleLoading={automationToggleCampaignId === campaign.id}
                onManualSetup={() => void runManualSetup(campaign.id)}
                onAutomationToggle={() => void toggleCampaignAutomation(campaign)}
                onToggle={() => setExpandedCampaignId(expanded ? null : campaign.id)}
              />
            );
          })}
        </div> : (<>

        <div
          ref={topTableScrollRef}
          onScroll={(event) => syncTableScroll(event.currentTarget, bottomTableScrollRef.current)}
          aria-label="캠페인 목록 가로 스크롤"
          className="h-5 overflow-x-auto border-b border-line"
        >
          <div className="h-px min-w-[1540px]" />
        </div>
        <div
          ref={bottomTableScrollRef}
          onScroll={(event) => syncTableScroll(event.currentTarget, topTableScrollRef.current)}
          className="overflow-x-auto"
        >
          <table className="w-full min-w-[1540px] table-fixed border-separate border-spacing-0">
            <caption className="sr-only">
              관리자 캠페인 운영 상태 및 자료 연결 현황
            </caption>
            <colgroup>
              <col className="w-[90px]" />
              <col className="w-[300px]" />
              <col className="w-[104px]" />
              <col className="w-[150px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[130px]" />
              <col className="w-[80px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col className="w-[300px]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-alt">
                <TableHeading stickyLeft>자동</TableHeading>
                <TableHeading stickyLeft stickyOffset="left-[90px]">캠페인</TableHeading>
                <TableHeading>운영 상태</TableHeading>
                <TableHeading>오늘 배정 / 일 한도</TableHeading>
                <TableHeading>지급</TableHeading>
                <TableHeading>코드</TableHeading>
                <TableHeading>원고 자료</TableHeading>
                <TableHeading>채널 연결</TableHeading>
                <TableHeading>참고자료</TableHeading>
                <TableHeading>리뷰검수</TableHeading>
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
                    automationLocked={automationLocked}
                    manualSetupEligible={campaign.manualSetupEligible}
                    manualSetupLoading={manualSetupCampaignId === campaign.id}
                    automationEnabled={campaignAutomationEnabled[campaign.id] ?? campaign.automationEnabled}
                    automationToggleLoading={automationToggleCampaignId === campaign.id}
                    onManualSetup={() => void runManualSetup(campaign.id)}
                    onAutomationToggle={() => void toggleCampaignAutomation(campaign)}
                    onToggle={() =>
                      setExpandedCampaignId(expanded ? null : campaign.id)
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div></>)}

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

function MobileCampaignCard({
  campaign,
  expanded,
  sourcePercent,
  status,
  automationLocked,
  manualSetupEligible,
  manualSetupLoading,
  automationEnabled,
  automationToggleLoading,
  onManualSetup,
  onAutomationToggle,
  onToggle,
}: {
  campaign: AdminCampaignOperationsRow;
  expanded: boolean;
  sourcePercent: number;
  status: ReturnType<typeof operationalCampaignStatus>;
  automationLocked: boolean;
  manualSetupEligible: boolean;
  manualSetupLoading: boolean;
  automationEnabled: boolean;
  automationToggleLoading: boolean;
  onManualSetup: () => void;
  onAutomationToggle: () => void;
  onToggle: () => void;
}) {
  const googleMapsUrl = safeGoogleMapsUrl(campaign.googleMapsUrl);

  return (
    <article className="overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {googleMapsUrl && !automationLocked ? (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-[15px] font-bold text-ink underline decoration-line-strong underline-offset-4"
              >
                {campaign.businessName}
              </a>
            ) : <p className="truncate text-[15px] font-bold text-ink">{campaign.businessName}</p>}
            <p className="mt-1 truncate text-xs text-ink-weak">
              {[campaign.category, campaign.address].filter(Boolean).join(" · ") || campaign.campaignName}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-[10px] bg-surface-alt p-2.5 text-xs">
          <div>
            <p className="text-ink-weak">오늘 배정</p>
            <p className="mt-1 font-bold tabular-nums text-ink">{campaign.assignedTodayCount} / {campaign.dailyQuota ?? "-"}</p>
          </div>
          <div>
            <p className="text-ink-weak">코드</p>
            <p className="mt-1 font-bold tabular-nums text-ink">{campaign.issuedCodeCount.toLocaleString("ko-KR")}개</p>
          </div>
          <div>
            <p className="text-ink-weak">리뷰 검수</p>
            <p className="mt-1 font-bold tabular-nums text-ink">{campaign.submittedReviewCount} / {campaign.passedReviewCount}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-[11px] text-ink-weak">
              <span>원고 자료 {campaign.draftSourceGroupCount}/4</span>
              <span>{campaign.canGenerateReviewDraft ? "준비 완료" : "자료 보완"}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
              <span
                className={campaign.canGenerateReviewDraft ? "block h-full rounded-full bg-success" : "block h-full rounded-full bg-brand"}
                style={{ width: `${sourcePercent}%` }}
              />
            </div>
          </div>
          <div className="flex gap-1" aria-label="연결 채널">
            <SourceChip label="G" title="Google 장소" connected={campaign.draftSourceGroups.googlePlace} />
            <SourceChip label="N" title="Naver 장소" connected={campaign.draftSourceGroups.naverPlace} warning={campaign.naverPlace?.matchStatus === "NEEDS_REVIEW"} />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <CampaignAutomationToggle
            enabled={automationEnabled}
            loading={automationToggleLoading}
            onToggle={onAutomationToggle}
          />
          <button
            type="button"
            onClick={onManualSetup}
            disabled={automationLocked || !manualSetupEligible || manualSetupLoading}
            title={!manualSetupEligible ? "시트 반영이 완료된 캠페인에서만 수동 세팅을 적용할 수 있습니다." : undefined}
            className="h-10 rounded-[9px] border border-brand/30 bg-brand-tint px-3 text-sm font-bold text-brand transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            {manualSetupLoading ? "요청 중" : manualSetupEligible ? "수동 세팅 적용" : "시트 반영 필요"}
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={`campaign-mobile-detail-${campaign.id}`}
            className="h-10 rounded-[9px] border border-line bg-surface px-3 text-sm font-bold text-ink-sub transition hover:border-line-strong hover:bg-surface-alt"
          >
            {expanded ? "상세 닫기" : "상세 보기"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div id={`campaign-mobile-detail-${campaign.id}`} className="border-t border-line bg-[#f8fbff] p-3.5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <AdminCampaignDraftPreview
              campaignId={campaign.id}
              businessName={campaign.businessName}
              totalQuota={campaign.totalQuota}
              initialMetrics={campaign.preparedDraftMetrics}
              readOnly={automationLocked}
            />
            <AdminCampaignReviewSubmissions
              campaignId={campaign.id}
              businessName={campaign.businessName}
              initialCount={campaign.submittedReviewCount}
              initialPassedCount={campaign.passedReviewCount}
              readOnly={automationLocked}
            />
          </div>
          {automationLocked ? (
            <p className="rounded-[10px] border border-brand/20 bg-brand-tint px-3 py-3 text-sm font-semibold leading-6 text-ink-sub">
              자동화 진행 중에는 상세 정보만 확인할 수 있습니다. 원고보관함·리뷰제출함의 상세 열람은 계속 가능합니다.
            </p>
          ) : (
            <>
              <AdminCampaignRewardPoints campaignId={campaign.id} initialRewardPoints={campaign.rewardPoints} />
              <div className="mt-3 space-y-3">
                <AdminCampaignNaverCandidates
                  key={`${campaign.id}:${campaign.naverPlace?.externalId ?? "unlinked"}:${campaign.naverPlace?.matchStatus ?? "none"}`}
                  campaignId={campaign.id}
                  initialPlace={campaign.naverPlace}
                  hasGooglePlace={campaign.hasGooglePlace}
                />
                <AdminCampaignBlogReferences
                  campaignId={campaign.id}
                  initialReferences={campaign.blogReferences}
                  initialCount={campaign.blogReferenceCount}
                />
                <AdminCampaignDraftGuidance campaignId={campaign.id} initialGuidance={campaign.draftGuidance} />
              </div>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

function CampaignRows({
  campaign,
  expanded,
  sourcePercent,
  status,
  automationLocked,
  manualSetupEligible,
  manualSetupLoading,
  automationEnabled,
  automationToggleLoading,
  onManualSetup,
  onAutomationToggle,
  onToggle,
}: {
  campaign: AdminCampaignOperationsRow;
  expanded: boolean;
  sourcePercent: number;
  status: ReturnType<typeof operationalCampaignStatus>;
  automationLocked: boolean;
  manualSetupEligible: boolean;
  manualSetupLoading: boolean;
  automationEnabled: boolean;
  automationToggleLoading: boolean;
  onManualSetup: () => void;
  onAutomationToggle: () => void;
  onToggle: () => void;
}) {
  const googleMapsUrl = safeGoogleMapsUrl(campaign.googleMapsUrl);

  return (
    <>
      <tr className="group h-[92px]">
        <td className="sticky left-0 z-20 border-t border-line bg-surface px-3 py-4 text-center group-first:border-t-0">
          <CampaignAutomationToggle
            enabled={automationEnabled}
            loading={automationToggleLoading}
            onToggle={onAutomationToggle}
          />
        </td>
        <td className="sticky left-[90px] z-10 border-t border-line bg-surface px-4 py-4 shadow-[2px_0_5px_rgba(16,24,40,0.06)] group-first:border-t-0">
          {googleMapsUrl && !automationLocked ? (
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
          <p className="mt-0.5 max-w-[300px] truncate text-[11px] leading-4 text-ink-weak">
            기간 {formatCampaignPeriod(campaign.startDate, campaign.endDate)}
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
          <p className="mt-1 whitespace-nowrap text-[11px] text-ink-weak">
            건당 {campaign.rewardPoints.toLocaleString("ko-KR")}P
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
        <TableCell>
          <AdminCampaignReviewSubmissions
            campaignId={campaign.id}
            businessName={campaign.businessName}
            initialCount={campaign.submittedReviewCount}
            initialPassedCount={campaign.passedReviewCount}
            readOnly={automationLocked}
          />
        </TableCell>
        <TableCell align="right">
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={onManualSetup}
              disabled={automationLocked || !manualSetupEligible || manualSetupLoading}
              title={!manualSetupEligible ? "시트 반영이 완료된 캠페인에서만 수동 세팅을 적용할 수 있습니다." : undefined}
              className="h-9 rounded-[9px] border border-brand/30 bg-brand-tint px-3 text-xs font-bold text-brand transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
            >
              {manualSetupLoading ? "요청 중" : manualSetupEligible ? "수동 세팅 적용" : "시트 반영 필요"}
            </button>
            <AdminCampaignDraftPreview
              campaignId={campaign.id}
              businessName={campaign.businessName}
              totalQuota={campaign.totalQuota}
              initialMetrics={campaign.preparedDraftMetrics}
              readOnly={automationLocked}
            />
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
          <td colSpan={11} className="border-t border-line bg-[#f8fbff] p-4">
            {automationLocked ? <p className="rounded-[10px] border border-brand/20 bg-brand-tint px-4 py-3 text-sm font-semibold text-ink-sub">자동화 진행 중에는 상세 정보만 확인할 수 있습니다. 원고보관함·리뷰제출함의 상세 열람은 계속 가능합니다.</p> : <><AdminCampaignRewardPoints
              campaignId={campaign.id}
              initialRewardPoints={campaign.rewardPoints}
            />
            <div className="grid gap-3 xl:grid-cols-3">
              <AdminCampaignNaverCandidates
                key={`${campaign.id}:${campaign.naverPlace?.externalId ?? "unlinked"}:${campaign.naverPlace?.matchStatus ?? "none"}`}
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
            </>}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function TableHeading({
  children,
  align = "left",
  stickyLeft = false,
  stickyOffset = "left-0",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  stickyLeft?: boolean;
  stickyOffset?: "left-0" | "left-[90px]";
}) {
  return (
    <th
      scope="col"
      className={`h-11 border-b border-line px-4 text-[11px] font-bold text-ink-weak ${
        align === "right" ? "text-right" : "text-left"
      } ${stickyLeft ? `sticky ${stickyOffset} z-30 bg-surface-alt shadow-[2px_0_5px_rgba(16,24,40,0.06)]` : ""}`}
    >
      {children}
    </th>
  );
}

function CampaignAutomationToggle({
  enabled,
  loading,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`캠페인 자동화 ${enabled ? "끄기" : "켜기"}`}
      disabled={loading}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-300 [transition-timing-function:cubic-bezier(0.7,0,0.9,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/50 disabled:cursor-not-allowed disabled:opacity-60 ${
        enabled ? "bg-success" : "bg-line-strong"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-5 rounded-full bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.28)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.7,0,0.9,0.4)] ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
      <span className="sr-only">{loading ? "저장 중" : enabled ? "자동화 켜짐" : "자동화 꺼짐"}</span>
    </button>
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
