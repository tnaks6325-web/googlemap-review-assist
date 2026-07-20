import { redirect } from "next/navigation";
import {
  AdminCampaignOperationsTable,
  type AdminCampaignOperationsRow,
} from "@/components/admin/AdminCampaignOperationsTable";
import { AdminShell } from "@/components/admin/AdminShell";
import { SheetImportDryRun } from "@/components/admin/SheetImportDryRun";
import { operationalCampaignStatus } from "@/lib/admin-campaign-table";
import { getAdminId } from "@/lib/auth/session";
import { listAdminCampaigns } from "@/lib/domain/operator-campaigns";

export const runtime = "nodejs";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1dktrajeVNFQAGShNe5bMmeA_LGtLF386fwQ2Z-xqHKs/edit?gid=1469964854#gid=1469964854";

export default async function AdminCampaignsPage() {
  const adminId = await getAdminId();
  if (!adminId) redirect("/admin/login");

  const campaigns = await listAdminCampaigns();
  const activeCount = campaigns.filter((campaign) => campaign.active).length;
  const assignedCount = campaigns.reduce(
    (sum, campaign) => sum + campaign.assignedCount,
    0,
  );
  const completedCount = campaigns.reduce(
    (sum, campaign) => sum + campaign.completedCount,
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

  return (
    <AdminShell
      current="campaigns"
      title="캠페인 운영"
      description="캠페인 현황과 원고 준비 상태를 표에서 비교하고 바로 조치합니다."
    >
      <section
        aria-label="캠페인 운영 요약"
        className="mb-5 grid overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:grid-cols-2 xl:grid-cols-4"
      >
        <Metric
          label="진행 중 캠페인"
          value={`${activeCount}건`}
          note="전체 운영"
        />
        <Metric
          label="배정 / 완료"
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

      <section className="mb-7 rounded-[13px] border border-blue-200 bg-blue-50/60 p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.6fr)_minmax(480px,1.4fr)] xl:items-start">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-1 size-2 shrink-0 rounded-full bg-success shadow-[0_0_0_4px_#dff7ec]"
            />
            <div>
              <p className="font-bold text-ink">Google Sheet 연동 정상</p>
              <p className="mt-1 text-xs leading-5 text-ink-weak">
                업체명, 장소 URL, 목표 수량과 가이드라인을 검사한 뒤
                캠페인으로 반영합니다.
              </p>
            </div>
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
      </section>

      <AdminCampaignOperationsTable campaigns={tableCampaigns} />
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
    <div className="min-h-24 border-b border-line p-5 last:border-b-0 sm:nth-[odd]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
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
