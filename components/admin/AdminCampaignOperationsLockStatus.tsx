import type { CampaignOperationsAutomationLock } from "@/lib/domain/campaign-operations-lock";

const STAGE_LABELS: Record<string, string> = {
  DISCOVERED: "신규 캠페인 등록 확인",
  IMPORTING: "캠페인 반영",
  NAVER_PLACE: "네이버 플레이스 연결",
  REFERENCE_EMPTY: "참고자료 수집",
  DRAFT_EVIDENCE: "원고 사실카드 분석",
  DRAFT_QUALITY: "미배정 원고 25개 생성",
  RETRY_REQUESTED: "자동화 재시도 예약",
};

function formatTime(value: Date | null) {
  if (!value) return "방금";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }).format(value);
}

export function AdminCampaignOperationsLockStatus({ state }: { state: CampaignOperationsAutomationLock }) {
  if (!state.isLocked) return null;
  const stage = state.stage ? STAGE_LABELS[state.stage] ?? state.stage : "신규 캠페인 감지·등록";
  return (
    <section aria-live="polite" className="mb-5 rounded-[13px] border border-brand/25 bg-brand-tint p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-brand shadow-[0_0_0_4px_#dce6ff]" />
          <div>
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-bold text-ink">캠페인 자동화 진행 중</h2><span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-brand">활성 작업 {state.activeJobCount}건</span></div>
            <p className="mt-1 text-sm font-semibold text-ink-sub">현재 단계: {stage}</p>
            <p className="mt-1 text-xs text-ink-weak">원고보관함·리뷰제출함과 상세 펼치기/접기만 사용할 수 있습니다. 나머지 변경 작업은 자동화가 끝난 뒤 해제됩니다.</p>
          </div>
        </div>
        <p className="shrink-0 text-xs font-semibold text-ink-sub">최근 갱신 {formatTime(state.updatedAt)} · 5분 단위 처리</p>
      </div>
    </section>
  );
}
