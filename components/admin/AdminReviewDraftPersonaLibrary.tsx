"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReviewDraftPersona } from "@/lib/domain/review-draft-personas";

type PersonaDraft = Pick<ReviewDraftPersona, "name" | "styleInstruction" | "examples" | "referenceUrls" | "active">;
const blankPersona: PersonaDraft = { name: "", styleInstruction: "", examples: [], referenceUrls: [], active: true };

function textLines(value: string) {
  return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
}

async function responseData(response: Response) {
  const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(data?.error?.message || "요청을 처리하지 못했습니다.");
  return data as Record<string, unknown>;
}

export function AdminReviewDraftPersonaLibrary({ initialPersonas }: { initialPersonas: ReviewDraftPersona[] }) {
  const [personas, setPersonas] = useState(initialPersonas);
  const [draft, setDraft] = useState<PersonaDraft>(blankPersona);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exampleText, setExampleText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(editingId ?? "create");
    setError(null);
    try {
      const response = await fetch(editingId ? `/api/admin/review-draft-personas/${encodeURIComponent(editingId)}` : "/api/admin/review-draft-personas", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await responseData(response) as { persona: ReviewDraftPersona };
      setPersonas((current) => editingId
        ? current.map((item) => item.id === data.persona.id ? data.persona : item)
        : [data.persona, ...current]);
      setDraft(blankPersona);
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "가상 리뷰어를 저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const addExample = async (persona: ReviewDraftPersona) => {
    const text = exampleText[persona.id] || "";
    setBusy(`example:${persona.id}`);
    setError(null);
    try {
      const response = await fetch(`/api/admin/review-draft-personas/${encodeURIComponent(persona.id)}/examples`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }),
      });
      const data = await responseData(response) as { persona: ReviewDraftPersona };
      setPersonas((current) => current.map((item) => item.id === persona.id ? data.persona : item));
      setExampleText((current) => ({ ...current, [persona.id]: "" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "학습용 원고를 저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (persona: ReviewDraftPersona) => {
    if (!window.confirm(`${persona.name} 가상 리뷰어와 학습 원고를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    setBusy(`delete:${persona.id}`);
    setError(null);
    try {
      await responseData(await fetch(`/api/admin/review-draft-personas/${encodeURIComponent(persona.id)}`, { method: "DELETE" }));
      setPersonas((current) => current.filter((item) => item.id !== persona.id));
      if (editingId === persona.id) { setEditingId(null); setDraft(blankPersona); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "가상 리뷰어를 삭제하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const beginEdit = (persona: ReviewDraftPersona) => {
    setEditingId(persona.id);
    setDraft({ name: persona.name, styleInstruction: persona.styleInstruction, examples: persona.examples, referenceUrls: persona.referenceUrls, active: persona.active });
    setError(null);
  };

  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="rounded-field border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</p> : null}
      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="text-lg font-bold text-ink">{editingId ? "가상 리뷰어 수정" : "새 가상 리뷰어"}</h2>
        <p className="mt-1 text-sm text-ink-sub">학습 원고는 모델 학습·프롬프트 스타일 참고에만 사용합니다. URL은 외부에서 읽어오지 않습니다.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-ink">이름<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 h-10 w-full rounded-field border border-line px-3 font-normal" maxLength={40} /></label>
          <label className="text-sm font-semibold text-ink">스타일 설명<textarea value={draft.styleInstruction} onChange={(event) => setDraft({ ...draft, styleInstruction: event.target.value })} className="mt-1 min-h-24 w-full rounded-field border border-line p-3 font-normal" maxLength={600} /></label>
          <label className="text-sm font-semibold text-ink md:col-span-2">참고 URL <span className="font-normal text-ink-weak">(한 줄에 하나, HTTPS만)</span><textarea value={draft.referenceUrls.join("\n")} onChange={(event) => setDraft({ ...draft, referenceUrls: textLines(event.target.value) })} className="mt-1 min-h-20 w-full rounded-field border border-line p-3 font-normal" /></label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />활성화</label>
        </div>
        <div className="mt-4 flex gap-2"><button type="button" onClick={() => void save()} disabled={busy !== null} className="rounded-field bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "저장 중" : editingId ? "수정 저장" : "가상 리뷰어 추가"}</button>{editingId ? <button type="button" onClick={() => { setEditingId(null); setDraft(blankPersona); }} className="rounded-field border border-line px-4 py-2 text-sm font-bold text-ink-sub">취소</button> : null}</div>
      </section>

      <section aria-label="가상 리뷰어 스타일 라이브러리" className="grid gap-4 lg:grid-cols-2">
        {personas.map((persona) => <article key={persona.id} className="rounded-card border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-ink">{persona.name}</h2><p className="mt-1 text-xs font-semibold text-brand">학습 원고 {persona.examples.length}개 · 버전 {persona.version} · {persona.active ? "활성" : "비활성"}</p></div><div className="flex gap-2"><button type="button" onClick={() => beginEdit(persona)} className="text-sm font-bold text-brand">관리</button><button type="button" disabled={busy !== null} onClick={() => void remove(persona)} className="text-sm font-bold text-danger">삭제</button></div></div>
          <p className="mt-4 whitespace-pre-wrap rounded-field bg-canvas p-3 text-sm text-ink-sub">{persona.styleInstruction || "스타일 설명을 아직 입력하지 않았습니다."}</p>
          {persona.referenceUrls.length ? <div className="mt-3 text-xs"><p className="font-semibold text-ink-weak">참고 링크 (열람 전용)</p>{persona.referenceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-brand underline">{url}</a>)}</div> : null}
          <div className="mt-4"><p className="text-sm font-bold text-ink">학습용 원고</p><div className="mt-2 max-h-48 space-y-2 overflow-y-auto">{persona.examples.map((example, index) => <p key={`${persona.id}-${index}`} className="rounded-field bg-canvas p-3 text-sm text-ink-sub"><span className="mr-2 font-bold text-brand">#{index + 1}</span>{example}</p>)}</div><textarea value={exampleText[persona.id] || ""} onChange={(event) => setExampleText((current) => ({ ...current, [persona.id]: event.target.value }))} placeholder="학습용 리뷰 원고를 입력하세요" className="mt-3 min-h-24 w-full rounded-field border border-line p-3 text-sm" maxLength={600} /><button type="button" disabled={busy !== null} onClick={() => void addExample(persona)} className="mt-2 rounded-field border border-brand/30 bg-brand-tint px-3 py-2 text-sm font-bold text-brand disabled:opacity-50">학습 원고 추가</button></div>
          <Link href={`/admin/fine-tuning?personaId=${encodeURIComponent(persona.id)}`} className="mt-4 inline-block text-sm font-bold text-brand underline">이 리뷰어로 파인튜닝 관리</Link>
        </article>)}
        {!personas.length ? <p className="rounded-card border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-weak">등록된 가상 리뷰어가 없습니다.</p> : null}
      </section>
    </div>
  );
}
