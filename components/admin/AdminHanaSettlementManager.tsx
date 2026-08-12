"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type Candidate = {
  reviewerId: string;
  displayName: string;
  maskedPhone: string;
  amount: number;
  payout: { bankName: string; maskedAccountNumber: string } | null;
  unavailableReason: string | null;
};
type Requested = {
  id: string;
  phone: string;
  amount: number;
  payout: { bankName: string; maskedAccountNumber: string } | null;
};
type Batch = {
  id: string;
  filename: string;
  count: number;
  totalAmount: number;
  createdAt: string;
  status: string;
  result: { paidCount: number; accountErrorCount: number; importedAt: string } | null;
};

const points = (value: number) => `${value.toLocaleString("ko-KR")}P`;

export function AdminHanaSettlementManager({
  candidates,
  requested,
  accountErrors,
  batches,
}: {
  candidates: Candidate[];
  requested: Requested[];
  accountErrors: Requested[];
  batches: Batch[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [resultFiles, setResultFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectable = candidates.filter((candidate) => !candidate.unavailableReason);
  const selectedTotal = useMemo(() => candidates
    .filter((candidate) => selectedIds.includes(candidate.reviewerId))
    .reduce((sum, candidate) => sum + candidate.amount, 0), [candidates, selectedIds]);

  const prepare = async () => {
    setBusy("prepare"); setNotice(null); setError(null);
    try {
      const response = await fetch("/api/admin/settlements/prepare", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewerIds: selectedIds }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message ?? "지급 대기 등록에 실패했습니다.");
      setNotice(`${data.created?.length ?? 0}명의 지급 대기 정산을 등록했습니다.${data.skipped?.length ? ` ${data.skipped.length}명은 제외되었습니다.` : ""}`);
      setSelectedIds([]); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "지급 대기 등록에 실패했습니다.");
    } finally { setBusy(null); }
  };

  const downloadExport = async () => {
    setBusy("export"); setNotice(null); setError(null);
    try {
      const response = await fetch("/api/admin/settlements/export", { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "이체 파일 생성에 실패했습니다.");
      }
      const header = response.headers.get("content-disposition") ?? "";
      const encodedName = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const filename = encodedName ? decodeURIComponent(encodedName) : "하나은행_다건이체.xls";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = filename; link.click();
      URL.revokeObjectURL(url);
      setNotice("하나은행 이체 파일을 다운로드했습니다. 은행의 최종 결과 파일을 받아 다음 단계에서 대조하세요.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "이체 파일 생성에 실패했습니다.");
    } finally { setBusy(null); }
  };

  const upload = async (batch: Batch) => {
    const file = resultFiles[batch.id];
    if (!file) return;
    setBusy(batch.id); setNotice(null); setError(null);
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch(`/api/admin/settlements/exports/${batch.id}/result`, { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message ?? "결과 파일 대조에 실패했습니다.");
      setNotice(`결과 대조가 완료되었습니다. 입금 완료 ${data.paidCount ?? 0}건, 이체 실패 ${data.accountErrorCount ?? 0}건입니다.`);
      setResultFiles((current) => ({ ...current, [batch.id]: null })); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "결과 파일 대조에 실패했습니다.");
    } finally { setBusy(null); }
  };

  return <div className="space-y-6">
    {notice ? <p className="rounded-card border border-brand/20 bg-brand-tint p-4 text-sm font-semibold text-brand" role="status">{notice}</p> : null}
    {error ? <p className="rounded-card border border-danger/20 bg-red-50 p-4 text-sm font-semibold text-danger" role="alert">{error}</p> : null}

    <section className="rounded-card border border-line bg-surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-bold text-ink">1. 지급 대상 등록</h2><p className="mt-1 text-sm text-ink-weak">계좌가 등록된 리뷰어의 현재 보유 포인트를 지급 대기로 옮깁니다.</p></div><div className="flex gap-2"><button type="button" className="rounded-btn bg-brand-tint px-3 py-2 text-sm font-semibold text-brand" onClick={() => setSelectedIds(selectedIds.length === selectable.length ? [] : selectable.map((item) => item.reviewerId))}>{selectedIds.length === selectable.length ? "선택 해제" : "지급 가능 전체 선택"}</button><Button disabled={!selectedIds.length} loading={busy === "prepare"} onClick={() => void prepare()}>선택 대상 등록</Button></div></div>
      <p className="mt-4 text-sm font-semibold text-ink">선택 금액 {points(selectedTotal)}</p>
      <div className="mt-3 overflow-x-auto rounded-card border border-line"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-canvas text-xs text-ink-weak"><tr><th className="px-4 py-3">선택</th><th className="px-4 py-3">리뷰어</th><th className="px-4 py-3">정산 계좌</th><th className="px-4 py-3 text-right">금액</th><th className="px-4 py-3">상태</th></tr></thead><tbody className="divide-y divide-line">{candidates.map((candidate) => <tr key={candidate.reviewerId}><td className="px-4 py-3"><input aria-label={`${candidate.displayName} 선택`} type="checkbox" disabled={Boolean(candidate.unavailableReason)} checked={selectedIds.includes(candidate.reviewerId)} onChange={() => setSelectedIds((current) => current.includes(candidate.reviewerId) ? current.filter((id) => id !== candidate.reviewerId) : [...current, candidate.reviewerId])} /></td><td className="px-4 py-3"><p className="font-semibold text-ink">{candidate.displayName}</p><p className="text-xs text-ink-weak">{candidate.maskedPhone}</p></td><td className="px-4 py-3 text-ink-sub">{candidate.payout ? `${candidate.payout.bankName} ${candidate.payout.maskedAccountNumber}` : "계좌 미등록"}</td><td className="px-4 py-3 text-right font-semibold text-ink">{points(candidate.amount)}</td><td className="px-4 py-3 text-xs text-ink-weak">{candidate.unavailableReason ?? "지급 가능"}</td></tr>)}</tbody></table>{!candidates.length ? <p className="p-5 text-center text-sm text-ink-weak">지급 가능한 보유 포인트가 있는 리뷰어가 없습니다.</p> : null}</div>
    </section>

    <section className="rounded-card border border-line bg-surface p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-bold text-ink">2. 하나은행 이체 파일 다운로드</h2><p className="mt-1 text-sm text-ink-weak">지급 대기 건을 하나은행 다건이체용 Excel 97-2003 파일로 내려받습니다.</p></div><Button disabled={!requested.length} loading={busy === "export"} onClick={() => void downloadExport()}>이체 파일 다운로드</Button></div><p className="mt-4 text-sm font-semibold text-ink">지급 대기 {requested.length}건 · {points(requested.reduce((sum, item) => sum + item.amount, 0))}</p></section>

    <section className="rounded-card border border-line bg-surface p-5"><h2 className="font-bold text-ink">3. 최종 이체 결과 대조</h2><p className="mt-1 text-sm text-ink-weak">하나은행에서 최종 처리된 .xls 결과만 업로드하세요. 처리중·예약 파일은 지급 완료로 반영되지 않습니다.</p><div className="mt-4 space-y-3">{batches.map((batch) => { const file = resultFiles[batch.id]; const complete = batch.status === "RECONCILED" || Boolean(batch.result); return <article key={batch.id} className="rounded-card border border-line p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><p className="font-semibold text-ink">{batch.filename}</p><p className="mt-1 text-xs text-ink-weak">{new Date(batch.createdAt).toLocaleString("ko-KR")} · {batch.count}건 · {points(batch.totalAmount)}</p>{complete && batch.result ? <p className="mt-2 text-sm text-emerald-700">대조 완료: 입금 {batch.result.paidCount}건 · 이체 실패 {batch.result.accountErrorCount}건</p> : null}</div>{complete ? <span className="w-fit rounded-full bg-success-tint px-3 py-1 text-xs font-bold text-emerald-700">반영 완료</span> : <div className="flex flex-wrap items-center gap-2"><input id={`hana-result-${batch.id}`} className="sr-only" type="file" accept=".xls,application/vnd.ms-excel" disabled={busy === batch.id} onChange={(event) => setResultFiles((current) => ({ ...current, [batch.id]: event.target.files?.[0] ?? null }))} /><label htmlFor={`hana-result-${batch.id}`} className="cursor-pointer rounded-btn border border-line px-3 py-2 text-sm font-semibold text-ink hover:border-brand hover:text-brand">결과 파일 선택</label><span className="max-w-44 truncate text-xs text-ink-weak">{file?.name ?? "선택된 파일 없음"}</span><Button disabled={!file} loading={busy === batch.id} onClick={() => void upload(batch)}>결과 대조</Button></div>}</div></article>; })}</div>{!batches.length ? <p className="mt-4 rounded-field bg-surface-alt p-5 text-center text-sm text-ink-weak">다운로드한 하나은행 이체 파일 이력이 없습니다.</p> : null}</section>

    {accountErrors.length ? <section className="rounded-card border border-danger/20 bg-surface p-5"><h2 className="font-bold text-ink">이체 실패 안내</h2><p className="mt-1 text-sm text-ink-weak">실패한 건은 포인트가 복구되었습니다. 리뷰어가 계좌를 수정한 뒤 다음 지급 대상 등록에서 다시 선택하세요.</p><ul className="mt-3 space-y-2 text-sm text-ink-sub">{accountErrors.map((item) => <li key={item.id}>{item.phone} · {points(item.amount)} · {item.payout ? `${item.payout.bankName} ${item.payout.maskedAccountNumber}` : "계좌 정보 확인 필요"}</li>)}</ul></section> : null}
  </div>;
}
