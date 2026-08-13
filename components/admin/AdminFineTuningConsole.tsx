"use client";

import { useState, type FormEvent } from "react";
import type { getFineTuningDashboard } from "@/lib/domain/draft-fine-tuning-admin";

type Dashboard = Awaited<ReturnType<typeof getFineTuningDashboard>>;
type Tab = "materials" | "datasets" | "jobs" | "models";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "materials", label: "학습 자료" },
  { id: "datasets", label: "데이터셋" },
  { id: "jobs", label: "튜닝 작업" },
  { id: "models", label: "모델 평가·운영" },
];

export function AdminFineTuningConsole({ initialData, personaId }: { initialData: Dashboard; personaId: string | null }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>("materials");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const query = personaId ? `?personaId=${encodeURIComponent(personaId)}` : "";
    const response = await fetch(`/api/admin/fine-tuning${query}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message ?? "현황을 불러오지 못했습니다.");
    setData(payload);
  }

  async function action(body: Record<string, unknown>, success: string) {
    const actionName = String(body.action);
    setBusy(actionName); setNotice(""); setError("");
    try {
      const response = await fetch("/api/admin/fine-tuning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, ...(personaId ? { personaId } : {}) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "작업을 완료하지 못했습니다.");
      await refresh();
      setNotice(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "작업을 완료하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  function submitExample(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action({
      action: "create-example", industry: form.get("industry"), styleLabel: form.get("styleLabel"), split: form.get("split"),
      inputText: form.get("inputText"), outputText: form.get("outputText"),
    }, "학습 후보를 등록했습니다. 승인 후 데이터셋에 포함됩니다.");
    event.currentTarget.reset();
  }

  return <div className="space-y-6">
    <p className="rounded-xl border border-brand/20 bg-brand-tint px-4 py-3 text-sm font-semibold text-brand">현재 범위: {data.scope.personaName}{personaId ? " · 이 가상 리뷰어에만 학습 데이터셋·활성 모델이 적용됩니다." : " · 기존 전역 파인튜닝 데이터입니다."}</p>
    <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
      <Metric label="학습 완성도" value={`${data.readiness.score}/100`} detail={data.readiness.gaps.length ? data.readiness.gaps.join(" · ") : "데이터셋 생성 기준 충족"} />
      <Metric label="준비 현황" value={`훈련 ${data.counts.approvedTrain}/100 · 검증 ${data.counts.approvedValidation}/20`} detail={`승인 대기 ${data.counts.pending}건 · ${data.improvementPlan.nextPriority}`} />
      <Metric label="튜닝 연결" value={data.config.bucketConfigured ? "저장소 연결됨" : "저장소 연결 필요"} detail={data.config.bucketConfigured ? `${data.config.baseModel} · ${data.config.tuningRegion}` : "Cloud Storage 버킷을 연결하면 데이터셋 생성이 열립니다."} />
    </section>

    {(notice || error) ? <div className={`rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{error || notice}</div> : null}

    <nav className="flex gap-2 overflow-x-auto border-b border-line" aria-label="파인튜닝 메뉴">
      {tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === item.id ? "border-brand text-brand" : "border-transparent text-ink-weak"}`}>{item.label}</button>)}
    </nav>

    {tab === "materials" ? <Materials data={data} busy={Boolean(busy)} action={action} submitExample={submitExample} /> : null}
    {tab === "datasets" ? <Datasets data={data} busy={Boolean(busy)} action={action} /> : null}
    {tab === "jobs" ? <Jobs data={data} busy={Boolean(busy)} action={action} /> : null}
    {tab === "models" ? <Models data={data} busy={Boolean(busy)} action={action} /> : null}
  </div>;
}

function Materials({ data, busy, action, submitExample }: { data: Dashboard; busy: boolean; action: (body: Record<string, unknown>, success: string) => Promise<void>; submitExample: (event: FormEvent<HTMLFormElement>) => void }) {
  return <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
    <form onSubmit={submitExample} className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div><h2 className="font-bold text-ink">학습 자료 직접 추가</h2><p className="mt-1 text-xs text-ink-weak">개인정보·비밀값·프롬프트 공격 문구는 자동 차단됩니다.</p></div>
      <Field name="industry" placeholder="업종 (예: 음식점)" />
      <Field name="styleLabel" placeholder="문체 유형 (예: 담백형)" />
      <select name="split" className="w-full rounded-lg border border-line px-3 py-2 text-sm"><option value="TRAIN">훈련 자료</option><option value="VALIDATION">검증 자료</option></select>
      <textarea name="inputText" required minLength={20} rows={5} placeholder="모델에 줄 매장·캠페인 정보와 작성 조건" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
      <textarea name="outputText" required minLength={20} rows={5} placeholder="정답으로 사용할 완성 원고" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
      <button disabled={busy} className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">후보로 등록</button>
      <button type="button" disabled={busy} onClick={() => void action({ action: "import-revisions" }, "관리자 수정 이력을 후보로 가져왔습니다.")} className="w-full rounded-lg border border-brand px-4 py-2.5 text-sm font-semibold text-brand disabled:opacity-50">관리자 수정 이력 가져오기</button>
    </form>
    <div className="overflow-hidden rounded-2xl border border-line bg-surface"><div className="border-b border-line px-5 py-4"><h2 className="font-bold text-ink">학습 후보 검수</h2></div><div className="max-h-[680px] divide-y divide-line overflow-auto">
      {data.examples.length ? data.examples.map((item) => <article key={item.id} className="p-4"><div className="flex flex-wrap items-center gap-2"><Badge>{item.status}</Badge><Badge>{item.sourceType === "MANUAL" ? "직접 입력" : "관리자 수정"}</Badge><span className="text-xs text-ink-weak">{item.industry ?? "미분류"} · {item.styleLabel ?? "유형 미지정"} · {item.split === "TRAIN" ? "훈련" : "검증"}</span></div><p className="mt-3 line-clamp-2 text-xs text-ink-sub">입력: {item.inputText}</p><p className="mt-2 line-clamp-3 text-sm text-ink">정답: {item.outputText}</p>{item.status === "PENDING" ? <div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => void action({ action: "update-example", id: item.id, status: "APPROVED" }, "학습 자료를 승인했습니다.")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">승인</button><button disabled={busy} onClick={() => void action({ action: "update-example", id: item.id, status: "REJECTED" }, "학습 자료를 제외했습니다.")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">제외</button></div> : null}</article>) : <p className="p-8 text-center text-sm text-ink-weak">등록된 학습 자료가 없습니다.</p>}
    </div></div>
  </section>;
}

function Datasets({ data, busy, action }: { data: Dashboard; busy: boolean; action: (body: Record<string, unknown>, success: string) => Promise<void> }) {
  return <section className="rounded-2xl border border-line bg-surface"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5"><div><h2 className="font-bold text-ink">불변 학습 데이터셋</h2><p className="mt-1 text-xs text-ink-weak">승인된 자료의 스냅샷을 Cloud Storage JSONL로 보존합니다.</p></div><button disabled={!data.readiness.readyForDataset || busy || !data.config.bucketConfigured} onClick={() => void action({ action: "build-dataset" }, "새 데이터셋을 생성했습니다.")} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">새 데이터셋 생성</button></div><div className="divide-y divide-line">{data.datasets.length ? data.datasets.map((item) => <div key={item.id} className="flex items-center justify-between p-5"><div><strong>데이터셋 v{item.version}</strong><p className="mt-1 text-xs text-ink-weak">훈련 {item.trainingExampleCount} · 검증 {item.validationExampleCount}</p></div><Badge>{item.status}</Badge></div>) : <p className="p-8 text-center text-sm text-ink-weak">아직 생성된 데이터셋이 없습니다.</p>}</div></section>;
}

function Jobs({ data, busy, action }: { data: Dashboard; busy: boolean; action: (body: Record<string, unknown>, success: string) => Promise<void> }) {
  const ready = data.datasets.filter((item) => item.status === "READY");
  return <section className="space-y-4"><div className="rounded-2xl border border-blue-100 bg-blue-50 p-5"><h2 className="font-bold text-blue-900">Vertex 파인튜닝</h2><p className="mt-1 text-sm text-blue-800">동시에 하나만 실행됩니다. 작업 생성은 Google Cloud 비용이 발생할 수 있습니다.</p><div className="mt-4 flex flex-wrap gap-2">{ready.map((item) => <button key={item.id} disabled={busy} onClick={() => void action({ action: "start-job", datasetId: item.id }, `데이터셋 v${item.version} 튜닝을 시작했습니다.`)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">v{item.version}로 튜닝 시작</button>)}</div></div><div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{data.jobs.length ? data.jobs.map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><strong>{job.displayName}</strong><p className="mt-1 text-xs text-ink-weak">데이터셋 v{job.dataset.version}{job.errorMessage ? ` · ${job.errorMessage}` : ""}</p></div><div className="flex items-center gap-2"><Badge>{job.status}</Badge>{["PENDING", "RUNNING", "SUBMITTING"].includes(job.status) ? <><button disabled={busy} onClick={() => void action({ action: "sync-job", id: job.id }, "Vertex 상태를 동기화했습니다.")} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">상태 갱신</button><button disabled={busy} onClick={() => void action({ action: "cancel-job", id: job.id }, "튜닝 취소를 요청했습니다.")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">취소</button></> : null}</div></div>) : <p className="p-8 text-center text-sm text-ink-weak">튜닝 작업이 없습니다.</p>}</div></section>;
}

function Models({ data, busy, action }: { data: Dashboard; busy: boolean; action: (body: Record<string, unknown>, success: string) => Promise<void> }) {
  return <section className="space-y-4">{data.releases.length ? data.releases.map((release) => <ReleaseCard key={release.id} release={release} busy={busy} action={action} />) : <div className="rounded-2xl border border-line bg-surface p-10 text-center text-sm text-ink-weak">완료된 튜닝 모델이 없습니다.</div>}</section>;
}

function ReleaseCard({ release, busy, action }: { release: Dashboard["releases"][number]; busy: boolean; action: (body: Record<string, unknown>, success: string) => Promise<void> }) {
  const [comparisons, setComparisons] = useState(String(release.evaluation.comparisonCount || 20));
  const [wins, setWins] = useState(String(Math.round(release.evaluation.candidateWinRate * Number(comparisons))));
  const [failures, setFailures] = useState(String(release.evaluation.criticalFailureCount));
  const eligible = release.tuningJob.status === "SUCCEEDED" && Number(comparisons) >= 20 && Number(wins) / Number(comparisons) >= 0.6 && Number(failures) === 0;
  return <article className="rounded-2xl border border-line bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex gap-2"><h2 className="font-bold text-ink">{release.tuningJob.displayName}</h2><Badge>{release.status}</Badge></div><p className="mt-2 break-all font-mono text-xs text-ink-weak">{release.endpointName}</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-3"><NumberField label="블라인드 비교 수" value={comparisons} setValue={setComparisons} /><NumberField label="후보 모델 승리 수" value={wins} setValue={setWins} /><NumberField label="치명 오류 수" value={failures} setValue={setFailures} /></div><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => void action({ action: "save-evaluation", releaseId: release.id, comparisonCount: Number(comparisons), candidateWins: Number(wins), criticalFailureCount: Number(failures) }, "모델 평가를 저장했습니다.")} className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand">평가 저장</button>{release.status !== "ACTIVE" ? <button disabled={busy || !eligible} onClick={() => { if (window.confirm("이 튜닝 모델을 실제 원고 생성에 적용할까요?")) void action({ action: "activate-release", releaseId: release.id, confirmed: true }, "튜닝 모델을 운영에 적용했습니다."); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">운영 모델로 적용</button> : null}<span className="self-center text-xs text-ink-weak">기준: 20건 이상 · 승률 60% 이상 · 치명 오류 0건</span></div></article>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-line bg-surface p-5"><p className="text-sm font-semibold text-ink-weak">{label}</p><p className="mt-3 text-2xl font-bold text-ink">{value}</p><p className="mt-3 text-xs leading-5 text-ink-sub">{detail}</p></div>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-ink-sub">{children}</span>; }
function Field(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />; }
function NumberField({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) { return <label className="text-sm text-ink-sub">{label}<input type="number" min="0" value={value} onChange={(event) => setValue(event.target.value)} className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink" /></label>; }
