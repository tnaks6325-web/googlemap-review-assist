"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface AdminCampaignAutomationStatusRow {
  campaignId: string;
  campaignName: string;
  businessName: string;
  runKey: string;
  status: string;
  stage: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    QUEUED: "대기",
    PROCESSING: "진행 중",
    RETRY: "자동 재시도 대기",
    READY: "완료",
    NEEDS_REVIEW: "검토 필요",
    FAILED: "실패",
  };
  return labels[status] ?? status;
}

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    DISCOVERED: "신규 등록 확인",
    IMPORTING: "캠페인 반영",
    RETRY_REQUESTED: "관리자 재시도 예약",
    NAVER_PLACE: "네이버 플레이스 연결",
    REFERENCE_EMPTY: "참고자료 수집",
    DRAFT_EVIDENCE: "원고 사실카드 분석",
    DRAFT_QUALITY: "미배정 원고 25개 생성",
    READY: "자동화 완료",
    FAILED: "자동화 실패",
  };
  return labels[stage] ?? stage;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function AdminCampaignAutomationStatus({
  rows,
  readOnly = false,
}: {
  rows: AdminCampaignAutomationStatusRow[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!rows.length) return null;

  const retry = async (campaignId: string) => {
    if (readOnly) return;
    setRetryingId(campaignId);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/campaigns/${campaignId}/automation/retry`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) {
        setMessage(body?.error?.message ?? "재시도를 예약하지 못했습니다.");
        return;
      }
      setMessage("자동화 재시도를 예약했습니다.");
      router.refresh();
    } catch {
      setMessage("네트워크 오류로 재시도를 예약하지 못했습니다.");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <section className="mb-7 rounded-[13px] border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-ink">자동화 상태</h2>
          <p className="mt-1 text-xs text-ink-weak">새 캠페인 자동화의 단계와 실패 사유를 확인하고, 검토 후 같은 단계부터 다시 실행합니다.</p>
        </div>
        {message ? <p role="status" className="text-xs font-semibold text-ink-sub">{message}</p> : null}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs">
          <caption className="sr-only">캠페인 자동화 상태와 재시도</caption>
          <thead className="border-y border-line bg-surface-alt text-ink-weak">
            <tr>
              <th scope="col" className="px-3 py-2 font-bold">캠페인</th>
              <th scope="col" className="px-3 py-2 font-bold">상태</th>
              <th scope="col" className="px-3 py-2 font-bold">현재 단계</th>
              <th scope="col" className="px-3 py-2 font-bold">실패 사유</th>
              <th scope="col" className="px-3 py-2 font-bold">업데이트</th>
              <th scope="col" className="px-3 py-2 text-right font-bold">조치</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const retryable = !readOnly && ["NEEDS_REVIEW", "FAILED"].includes(row.status);
              return (
                <tr key={row.campaignId} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-3"><p className="font-bold text-ink">{row.businessName}</p><p className="mt-0.5 text-ink-weak">{row.campaignName}</p></td>
                  <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 font-bold ${retryable ? "bg-amber-50 text-amber-700" : row.status === "READY" ? "bg-success-tint text-success" : "bg-brand-tint text-brand"}`}>{statusLabel(row.status)}</span></td>
                  <td className="px-3 py-3 font-medium text-ink-sub">{stageLabel(row.stage)}<p className="mt-0.5 text-[11px] text-ink-weak">시도 {row.attempts}/{row.maxAttempts}</p></td>
                  <td className="max-w-72 px-3 py-3 text-ink-weak">{row.lastError ?? (row.nextRetryAt ? `다음 재시도 ${dateTime(row.nextRetryAt)}` : "-" )}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-ink-weak">{dateTime(row.updatedAt)}</td>
                  <td className="px-3 py-3 text-right">{retryable ? <button type="button" onClick={() => void retry(row.campaignId)} disabled={retryingId !== null} className="h-8 rounded-[8px] border border-line px-3 font-bold text-brand transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-60">{retryingId === row.campaignId ? "예약 중" : "재시도"}</button> : <span className="text-ink-weak">자동 진행</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
