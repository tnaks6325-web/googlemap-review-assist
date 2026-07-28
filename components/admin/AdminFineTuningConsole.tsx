"use client";

import { FormEvent, useState } from "react";

type Dashboard = {
  readiness: { score: number; readyForDataset: boolean; gaps: string[] };
  counts: { pending: number; approvedTrain: number; approvedValidation: number };
  config: { baseModel: string; tuningRegion: string; bucketConfigured: boolean };
  examples: Array<{ id: string; sourceType: string; industry: string | null; styleLabel: string | null; inputText: string; outputText: string; split: string; status: string }>;
  datasets: Array<{ id: string; version: number; status: string; trainingExampleCount: number; validationExampleCount: number }>;
  jobs: Array<{ id: string; displayName: string; status: string; errorMessage: string | null; dataset: { version: number } }>;
  releases: Array<{ id: string; endpointName: string; status: string; evaluation: { comparisonCount: number; candidateWinRate: number; criticalFailureCount: number }; tuningJob: { status: string; displayName: string } }>;
};
type Tab = "materials" | "datasets" | "jobs" | "models";
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "materials", label: "학습 자료" }, { id: "datasets", label: "데이터셋" },
  { id: "jobs", label: "튜닝 작업" }, { id: "models", label: "모델 평가·운영" },
];
type Tone = "gray" | "green" | "amber" | "red" | "blue";

function toneFor(status: string): Tone {
  if (["APPROVED", "READY", "SUCCEEDED", "ACTIVE"].includes(status)) return "green";
  if (["FAILED", "REJECTED", "CANCELLED"].includes(status)) return "red";
  if (["RUNNING", "SUBMITTING"].includes(status)) return "blue";
  return "amber";
}
function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  const colors = { gray: "bg-slate-100 text-slate-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", blue: "bg-blue-50 text-blue-700" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${colors[tone]}`}>{children}</span>;
}

export function AdminFineTuningConsole({ initialData }: { initialData: Dashboard }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>("materials");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/fine-tuning", { cache: "no-store" });
    if (!response.ok) throw new Error("현황을 새로 불러오지 못했습니다.");
    setData(await response.json() as Dashboard);
  }
  async function action(body: Record<string, unknown>, success: string) {
    setBusy(String(body.action)); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/fine-tuning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(result?.error?.message || "작업에 실패했습니다.");
      await refresh(); setNotice(success);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "작업에 실패했습니다."); }
    finally { setBusy(""); }
  }
  async function submitExample(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action({ action: "create-example", industry: form.get("industry"), styleLabel: form.get("styleLabel"), split: form.get("split"), inputText: form.get("inputText"), outputText: form.get("outputText") }, "학습 후보를 등록했습니다. 승인 후 데이터셋에 포함됩니다.");
  }

  return <div className="space-y-6">
    <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
      <div className="rounded-2xl border border-line bg-surface p-5"><p className="text-sm font-semibold text-ink-weak">학습 완성도</p><div className="mt-3 flex items-end gap-2"><strong className="text-4xl text-ink">{data.readiness.score}</strong><span className="pb-1 text-sm text-ink-weak">/ 100</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${data.readiness.score}%` }} /></div></div>
      <div className="rounded-2xl border border-line bg-surface p-5"><p className="text-sm font-semibold text-ink">준비 현황</p><div className="mt-4 grid grid-cols-3 gap-3 text-sm"><Count label="승인 훈련" value={`${data.counts.approvedTrain}/100`} /><Count label="승인 검증" value={`${data.counts.approvedValidation}/20`} /><Count label="승인 대기" value={String(data.counts.pending)} /></div>{data.readiness.gaps.length ? <p className="mt-4 text-sm text-amber-700">다음 보완: {data.readiness.gaps.slice(0, 2).join(" · ")}</p> : <p className="mt-4 text-sm text-emerald-700">데이터셋 생성 기준을 충족했습니다.</p>}</div>
      <div className="rounded-2xl border border-line bg-surface p-5 text-sm"><p className="font-semibold text-ink">현재 기반 모델</p><p className="mt-2 font-mono text-xs">{data.config.baseModel}</p><p className="mt-3 text-ink-sub">튜닝 리전 {data.config.tuningRegion}</p><div className="mt-3"><Badge tone={data.config.bucketConfigured ? "green" : "red"}>{data.config.bucketConfigured ? "저장소 연결됨" : "튜닝 버킷 설정 필요"}</Badge></div></div>
    </section>
    {(notice || error) && <div className={`rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{error || notice}</div>}
    <div className="border-b border-line"><div className="flex gap-2 overflow-x-auto">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === item.id ? "border-brand text-brand" : "border-transparent text-ink-weak"}`}>{item.label}</button>)}</div></div>

    {tab === "materials" && <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <form onSubmit={submitExample} className="space-y-3 rounded-2xl border border-line bg-surface p-5"><div><h2 className="font-bold">학습 자료 직접 추가</h2><p className="mt-1 text-xs text-ink-weak">개인정보와 프롬프트 공격 문구는 자동 차단됩니다.</p></div><Field name="industry" placeholder="업종 (예: 병원)" /><Field name="styleLabel" placeholder="문체 유형 (예: 담백형)" /><select name="split" className="w-full rounded-lg border border-line px-3 py-2 text-sm"><option value="TRAIN">훈련 자료</option><option value="VALIDATION">검증 자료</option></select><textarea name="inputText" required minLength={20} rows={5} placeholder="모델에 줄 매장·캠페인 정보와 작성 조건" className="w-full rounded-lg border border-line px-3 py-2 text-sm" /><textarea name="outputText" required minLength={20} rows={5} placeholder="정답으로 사용할 완성 원고" className="w-full rounded-lg border border-line px-3 py-2 text-sm" /><Primary disabled={Boolean(busy)}>후보로 등록</Primary><button type="button" disabled={Boolean(busy)} onClick={() => action({ action: "import-revisions" }, "관리자 수정 이력을 후보로 가져왔습니다.")} className="w-full rounded-lg border border-brand px-4 py-2.5 text-sm font-semibold text-brand disabled:opacity-50">관리자 수정 이력 가져오기</button></form>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface"><div className="border-b border-line px-5 py-4"><h2 className="font-bold">학습 후보 검수</h2></div><div className="max-h-[680px] divide-y divide-line overflow-auto">{data.examples.length ? data.examples.map((item) => <article key={item.id} className="p-4"><div className="flex flex-wrap items-center gap-2"><Badge tone={toneFor(item.status)}>{item.status}</Badge><Badge>{item.sourceType === "MANUAL" ? "직접 입력" : "관리자 수정"}</Badge><span className="text-xs text-ink-weak">{item.industry || "미분류"} · {item.styleLabel || "유형 미지정"} · {item.split === "TRAIN" ? "훈련" : "검증"}</span></div><p className="mt-3 line-clamp-2 text-xs text-ink-sub">입력: {item.inputText}</p><p className="mt-2 line-clamp-3 text-sm text-ink">정답: {item.outputText}</p>{item.status === "PENDING" && <div className="mt-3 flex gap-2"><button onClick={() => action({ action: "update-example", id: item.id, status: "APPROVED" }, "학습 자료를 승인했습니다.")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">승인</button><button onClick={() => action({ action: "update-example", id: item.id, status: "REJECTED" }, "학습 자료를 제외했습니다.")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">제외</button></div>}</article>) : <p className="p-8 text-center text-sm text-ink-weak">등록된 학습 자료가 없습니다.</p>}</div></div>
    </div>}

    {tab === "datasets" && <section className="rounded-2xl border border-line bg-surface"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5"><div><h2 className="font-bold">불변 학습 데이터셋</h2><p className="mt-1 text-xs text-ink-weak">승인된 자료를 고정하고 Cloud Storage에 JSONL로 저장합니다.</p></div><button disabled={!data.readiness.readyForDataset || Boolean(busy) || !data.config.bucketConfigured} onClick={() => action({ action: "build-dataset" }, "새 데이터셋을 생성했습니다.")} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">새 데이터셋 생성</button></div><div className="divide-y divide-line">{data.datasets.map((item) => <div key={item.id} className="flex items-center justify-between p-5"><div><strong>데이터셋 v{item.version}</strong><p className="mt-1 text-xs text-ink-weak">훈련 {item.trainingExampleCount} · 검증 {item.validationExampleCount}</p></div><Badge tone={toneFor(item.status)}>{item.status}</Badge></div>)}</div></section>}

    {tab === "jobs" && <section className="space-y-4"><div className="rounded-2xl border border-blue-100 bg-blue-50 p-5"><h2 className="font-bold text-blue-900">스스로 파인튜닝</h2><p className="mt-1 text-sm text-blue-800">READY 데이터셋을 선택하면 Gemini 권장 기본값으로 시작합니다. 동시에 하나만 실행됩니다.</p><div className="mt-4 flex flex-wrap gap-2">{data.datasets.filter((item) => item.status === "READY").map((item) => <button key={item.id} disabled={Boolean(busy)} onClick={() => action({ action: "start-job", datasetId: item.id }, `데이터셋 v${item.version} 튜닝을 시작했습니다.`)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">v{item.version}로 튜닝 시작</button>)}</div></div><div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{data.jobs.map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><strong>{job.displayName}</strong><p className="mt-1 text-xs text-ink-weak">데이터셋 v{job.dataset.version}{job.errorMessage ? ` · ${job.errorMessage}` : ""}</p></div><div className="flex items-center gap-2"><Badge tone={toneFor(job.status)}>{job.status}</Badge>{["PENDING", "RUNNING", "SUBMITTING"].includes(job.status) && <><button onClick={() => action({ action: "sync-job", id: job.id }, "Vertex 상태를 동기화했습니다.")} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">상태 갱신</button><button onClick={() => action({ action: "cancel-job", id: job.id }, "튜닝 취소를 요청했습니다.")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">취소</button></>}</div></div>)}</div></section>}

    {tab === "models" && <section className="space-y-4">{data.releases.length ? data.releases.map((release) => <ReleaseCard key={release.id} release={release} busy={Boolean(busy)} action={action} />) : <div className="rounded-2xl border border-line bg-surface p-10 text-center text-sm text-ink-weak">완료된 튜닝 모델이 없습니다.</div>}</section>}
  </div>;
}

function Count({ label, value }: { label: string; value: string }) { return <div><span className="block text-ink-weak">{label}</span><strong className="text-lg">{value}</strong></div>; }
function Field(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />; }
function Primary({ children, disabled }: { children: React.ReactNode; disabled: boolean }) { return <button disabled={disabled} className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{children}</button>; }

function ReleaseCard({ release, busy, action }: { release: Dashboard["releases"][number]; busy: boolean; action: (body: Record<string, unknown>, success: string) => Promise<void> }) {
  const [comparisons, setComparisons] = useState(String(release.evaluation.comparisonCount || 20));
  const [wins, setWins] = useState(String(Math.round(release.evaluation.candidateWinRate * (release.evaluation.comparisonCount || 20))));
  const [failures, setFailures] = useState(String(release.evaluation.criticalFailureCount));
  const eligible = release.tuningJob.status === "SUCCEEDED" && release.evaluation.comparisonCount >= 20 && release.evaluation.candidateWinRate >= 0.6 && release.evaluation.criticalFailureCount === 0;
  return <article className="rounded-2xl border border-line bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex gap-2"><h2 className="font-bold">{release.tuningJob.displayName}</h2><Badge tone={toneFor(release.status)}>{release.status}</Badge></div><p className="mt-2 break-all font-mono text-xs text-ink-weak">{release.endpointName}</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-3"><NumberField label="블라인드 비교 수" value={comparisons} setValue={setComparisons} /><NumberField label="후보 모델 승리 수" value={wins} setValue={setWins} /><NumberField label="치명 오류 수" value={failures} setValue={setFailures} /></div><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => action({ action: "save-evaluation", releaseId: release.id, comparisonCount: Number(comparisons), candidateWins: Number(wins), criticalFailureCount: Number(failures) }, "모델 평가를 저장했습니다.")} className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand">평가 저장</button>{release.status !== "ACTIVE" && <button disabled={busy || !eligible} onClick={() => { if (window.confirm("이 튜닝 모델을 실제 원고 생성에 적용할까요?")) void action({ action: "activate-release", releaseId: release.id, confirmed: true }, "튜닝 모델을 운영에 적용했습니다."); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">운영 모델로 적용</button>}<span className="self-center text-xs text-ink-weak">기준: 20건 이상 · 승률 60% 이상 · 치명 오류 0건</span></div></article>;
}
function NumberField({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) { return <label className="text-xs text-ink-weak">{label}<input value={value} onChange={(event) => setValue(event.target.value)} type="number" min="0" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink" /></label>; }
