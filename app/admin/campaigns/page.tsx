import { redirect } from "next/navigation";
import {
  AdminCampaignOperationsTable,
  type AdminCampaignOperationsRow,
} from "@/components/admin/AdminCampaignOperationsTable";
import {
  AdminCampaignAutomationStatus,
  type AdminCampaignAutomationStatusRow,
} from "@/components/admin/AdminCampaignAutomationStatus";
import { AdminCampaignOperationsLockStatus } from "@/components/admin/AdminCampaignOperationsLockStatus";
import { CampaignAutomationModeToggle } from "@/components/admin/CampaignAutomationModeToggle";
import { GoogleSheetConnectionStatus } from "@/components/admin/GoogleSheetConnectionStatus";
import { AdminShell } from "@/components/admin/AdminShell";
import { SheetImportDryRun } from "@/components/admin/SheetImportDryRun";
import { operationalCampaignStatus } from "@/lib/admin-campaign-table";
import { getAdminId } from "@/lib/auth/session";
import { listAdminCampaignAutomationStatuses } from "@/lib/domain/campaign-automation-admin";
import { getCampaignAutomationControl } from "@/lib/domain/campaign-automation-control";
import { getCampaignOperationsAutomationLock } from "@/lib/domain/campaign-operations-lock";
import { listAdminCampaigns } from "@/lib/domain/operator-campaigns";
import { readGoogleSpreadsheetTitle } from "@/lib/google-sheets";

export const runtime = "nodejs";

const SPREADSHEET_ID =
  "1dktrajeVNFQAGShNe5bMmeA_LGtLF386fwQ2Z-xqHKs";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?gid=1469964854#gid=1469964854`;

export default async function AdminCampaignsPage() {
  const adminId = await getAdminId();
  if (!adminId) redirect("/admin/login");

  const [campaigns, spreadsheetTitle, automationStatuses, automationLock, automationControl] = await Promise.all([
    listAdminCampaigns(),
    readGoogleSpreadsheetTitle(SPREADSHEET_ID).catch(() => null),
    listAdminCampaignAutomationStatuses(),
    getCampaignOperationsAutomationLock(),
    getCampaignAutomationControl(),
  ]);
  const activeCount = campaigns.filter((campaign) => campaign.active).length;
  const assignedCount = campaigns.reduce(
    (sum, campaign) => sum + campaign.assignedTodayCount,
    0,
  );
  const completedCount = campaigns.reduce(
    (sum, campaign) => sum + campaign.completedTodayCount,
    0,
  );
  const paidPointAmount = campaigns.reduce(
    (sum, campaign) => sum + campaign.paidPointAmount,
    0,
  );
  const attentionCount = campaigns.filter(
    (campaign) => operationalCampaignStatus(campaign).key === "attention",
  ).length;
  const tableCampaigns: AdminCampaignOperationsRow[] = campaigns.map(
    (campaign) => ({
      ...campaign,
      createdAt: campaign.createdAt.toISOString(),
    }),
  );
  const automationStatusRows: AdminCampaignAutomationStatusRow[] = automationStatuses.map((status) => ({
    ...status,
    nextRetryAt: status.nextRetryAt?.toISOString() ?? null,
    updatedAt: status.updatedAt.toISOString(),
  }));

  return (
    <AdminShell
      current="campaigns"
      title="캠페인 운영"
      description="캠페인 현황과 원고 준비 상태를 표에서 비교하고 바로 조치합니다."
      wideContent
    >
      <section
        aria-label="캠페인 운영 요약"
        className="mb-5 grid grid-cols-2 overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)] xl:grid-cols-4"
      >
        <Metric
          label="진행 중 캠페인"
          value={`${activeCount}건`}
          note="전체 운영"
        />
        <Metric
          label="오늘 배정 / 오늘 완료"
          value={`${assignedCount.toLocaleString("ko-KR")} / ${completedCount.toLocaleString("ko-KR")}건`}
        />
        <Metric
          label="자료 보정 필요"
          value={`${attentionCount}건`}
          note={attentionCount ? "확인 필요" : "모두 정상"}
          warning={attentionCount > 0}
        />
        <Metric
          label="지급 포인트"
          value={`${paidPointAmount.toLocaleString("ko-KR")}P`}
        />
      </section>

      <CampaignAutomationModeToggle enabled={automationControl.enabled} />

      <AdminCampaignOperationsLockStatus state={automationLock} />

      {!automationLock.isLocked ? <section className="mb-7 rounded-[13px] border border-blue-200 bg-blue-50/60 p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.6fr)_minmax(480px,1.4fr)] xl:items-start">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-1 size-2 shrink-0 rounded-full bg-success shadow-[0_0_0_4px_#dff7ec]"
            />
            <GoogleSheetConnectionStatus title={spreadsheetTitle} />
          </div>
          <div className="rounded-[11px] border border-blue-100 bg-white/80 p-4">
            <div className="mb-3 flex justify-end">
              <a
                href={SHEET_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-[9px] bg-brand-tint px-3 text-xs font-bold text-brand"
              >
                광고 요청 시트 열기 ↗
              </a>
            </div>
            <SheetImportDryRun />
          </div>
        </div>
      </section> : null}

      <AdminCampaignAutomationStatus rows={automationStatusRows} readOnly={automationLock.isLocked} />

      <AdminCampaignOperationsTable campaigns={tableCampaigns} automationLocked={automationLock.isLocked} automationEnabled={automationControl.enabled} />
    </AdminShell>
  );
}

function Metric({
  label,
  value,
  note,
  warning = false,
}: {
  label: string;
  value: string;
  note?: string;
  warning?: boolean;
}) {
  return (
    <div className="min-h-24 border-b border-line p-4 last:border-b-0 odd:border-r xl:border-b-0 xl:border-r xl:last:border-r-0 lg:p-5">
      <p className="text-xs text-ink-weak">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">
        {value}
        {note ? (
          <span
            className={`ml-2 align-middle text-[11px] font-bold ${
              warning ? "text-amber-700" : "text-success"
            }`}
          >
            {note}
          </span>
        ) : null}
      </p>
    </div>
  );
}
