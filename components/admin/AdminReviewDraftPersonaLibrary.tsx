"use client";

import { useState } from "react";
import { AdminFineTuningPanel } from "@/components/admin/AdminFineTuningConsole";
import type { ReviewDraftPersona } from "@/lib/domain/review-draft-personas";

type PersonaDraft = Pick<ReviewDraftPersona, "name" | "styleInstruction" | "examples" | "referenceUrls" | "active">;

const blankPersona: PersonaDraft = {
  name: "",
  styleInstruction: "",
  examples: [],
  referenceUrls: [],
  active: true,
};

function textLines(value: string) {
  return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
}

async function responseData(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(data?.error?.message || "요청을 처리하지 못했습니다.");
  return data as Record<string, unknown>;
}

export function AdminReviewDraftPersonaLibrary({
  initialPersonas,
  initialAdvancedPersonaId = null,
}: {
  initialPersonas: ReviewDraftPersona[];
  initialAdvancedPersonaId?: string | null;
}) {
  const [personas, setPersonas] = useState(initialPersonas);
  const [draft, setDraft] = useState<PersonaDraft>(blankPersona);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [advancedPersonaId, setAdvancedPersonaId] = useState<string | null>(initialAdvancedPersonaId);
  const [exampleText, setExampleText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(editingId ?? "create");
    setError(null);
    try {
      const response = await fetch(
        editingId
          ? `/api/admin/review-draft-personas/${encodeURIComponent(editingId)}`
          : "/api/admin/review-draft-personas",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const data = (await responseData(response)) as { persona: ReviewDraftPersona };
      setPersonas((current) =>
        editingId
          ? current.map((item) => (item.id === data.persona.id ? data.persona : item))
          : [data.persona, ...current],
      );
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
      const response = await fetch(
        `/api/admin/review-draft-personas/${encodeURIComponent(persona.id)}/examples`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      const data = (await responseData(response)) as { persona: ReviewDraftPersona };
      setPersonas((current) => current.map((item) => (item.id === persona.id ? data.persona : item)));
      setExampleText((current) => ({ ...current, [persona.id]: "" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "스타일 원고를 저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (persona: ReviewDraftPersona) => {
    if (!window.confirm(`${persona.name} 가상 리뷰어와 스타일 원고를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    setBusy(`delete:${persona.id}`);
    setError(null);
    try {
      await responseData(
        await fetch(`/api/admin/review-draft-personas/${encodeURIComponent(persona.id)}`, { method: "DELETE" }),
      );
      setPersonas((current) => current.filter((item) => item.id !== persona.id));
      if (editingId === persona.id) {
        setEditingId(null);
        setDraft(blankPersona);
      }
      if (advancedPersonaId === persona.id) setAdvancedPersonaId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "가상 리뷰어를 삭제하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const beginEdit = (persona: ReviewDraftPersona) => {
    setEditingId(persona.id);
    setDraft({
      name: persona.name,
      styleInstruction: persona.styleInstruction,
      examples: persona.examples,
      referenceUrls: persona.referenceUrls,
      active: persona.active,
    });
    setError(null);
  };

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-field border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="text-lg font-bold text-ink">{editingId ? "가상 리뷰어 수정" : "새 가상 리뷰어"}</h2>
        <p className="mt-1 text-sm text-ink-sub">
          활성화한 캐릭터의 스타일 설명과 스타일 원고는 원고 생성에 바로 반영됩니다. Vertex 고급 튜닝은 선택 사항입니다.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-ink">
            이름
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 h-10 w-full rounded-field border border-line px-3 font-normal" maxLength={40} />
          </label>
          <label className="text-sm font-semibold text-ink">
            스타일 설명
            <textarea value={draft.styleInstruction} onChange={(event) => setDraft({ ...draft, styleInstruction: event.target.value })} className="mt-1 min-h-24 w-full rounded-field border border-line p-3 font-normal" maxLength={600} />
          </label>
          <label className="text-sm font-semibold text-ink md:col-span-2">
            참고 URL <span className="font-normal text-ink-weak">(한 줄에 하나, HTTPS만 · 저장·열람 전용)</span>
            <textarea value={draft.referenceUrls.join("\n")} onChange={(event) => setDraft({ ...draft, referenceUrls: textLines(event.target.value) })} className="mt-1 min-h-20 w-full rounded-field border border-line p-3 font-normal" />
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
            원고 생성에 활성화
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => void save()} disabled={busy !== null} className="rounded-field bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "저장 중" : editingId ? "수정 저장" : "가상 리뷰어 추가"}
          </button>
          {editingId ? (
            <button type="button" onClick={() => { setEditingId(null); setDraft(blankPersona); }} className="rounded-field border border-line px-4 py-2 text-sm font-bold text-ink-sub">
              취소
            </button>
          ) : null}
        </div>
      </section>

      <section aria-label="가상 리뷰어 스타일 라이브러리" className="grid gap-4 lg:grid-cols-2">
        {personas.map((persona) => {
          const advancedOpen = advancedPersonaId === persona.id;
          return (
            <article key={persona.id} className={`rounded-card border border-line bg-surface p-5 ${advancedOpen ? "lg:col-span-2" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-ink">{persona.name}</h2>
                  <p className="mt-1 text-xs font-semibold text-brand">
                    스타일 원고 {persona.examples.length}개 · 버전 {persona.version} · {persona.active ? "활성" : "비활성"}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => beginEdit(persona)} className="text-sm font-bold text-brand">관리</button>
                  <button type="button" disabled={busy !== null} onClick={() => void remove(persona)} className="text-sm font-bold text-danger disabled:opacity-50">삭제</button>
                </div>
              </div>

              <div className="mt-4 border-y border-brand/15 bg-brand-tint px-4 py-3 text-sm text-ink-sub">
                <p className="font-bold text-brand">기본 스타일은 즉시 원고 생성에 적용됩니다.</p>
                <p className="mt-1">{persona.active ? "이 캐릭터의 스타일 설명과 저장한 원고를 프롬프트에 반영합니다. Vertex 모델 학습은 필요하지 않습니다." : "비활성 캐릭터입니다. 활성화하면 스타일 설명과 저장한 원고가 다음 원고 생성부터 적용됩니다."}</p>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-ink-sub">{persona.styleInstruction || "스타일 설명을 아직 입력하지 않았습니다."}</p>

              {persona.referenceUrls.length ? (
                <div className="mt-4 text-xs">
                  <p className="font-semibold text-ink-weak">참고 링크 (열람 전용)</p>
                  {persona.referenceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-brand underline underline-offset-2">{url}</a>)}
                </div>
              ) : null}

              <div className="mt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-ink">스타일 원고</h3>
                    <p className="mt-1 text-xs text-ink-weak">저장하면 기본 스타일로 바로 사용됩니다.</p>
                  </div>
                </div>
                <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                  {persona.examples.map((example, index) => (
                    <p key={`${persona.id}-${index}`} className="border-b border-line py-3 text-sm leading-6 text-ink-sub last:border-b-0">
                      <span className="mr-2 font-bold text-brand">#{index + 1}</span>{example}
                    </p>
                  ))}
                  {!persona.examples.length ? <p className="py-3 text-sm text-ink-weak">저장된 스타일 원고가 없습니다.</p> : null}
                </div>
                <textarea value={exampleText[persona.id] || ""} onChange={(event) => setExampleText((current) => ({ ...current, [persona.id]: event.target.value }))} placeholder="이 캐릭터의 말투를 보여 주는 리뷰 원고를 입력하세요" className="mt-3 min-h-24 w-full rounded-field border border-line p-3 text-sm" maxLength={600} />
                <button type="button" disabled={busy !== null} onClick={() => void addExample(persona)} className="mt-2 rounded-field border border-brand/30 bg-brand-tint px-3 py-2 text-sm font-bold text-brand disabled:opacity-50">스타일 원고 추가</button>
              </div>

              <section className="mt-6 border-t border-line pt-5" aria-label={`${persona.name} 고급 튜닝`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-ink">고급 튜닝 <span className="font-normal text-ink-weak">(선택)</span></h3>
                    <p className="mt-1 text-xs text-ink-weak">대량 학습 데이터·Vertex 모델 평가·운영 적용이 필요할 때만 사용합니다.</p>
                  </div>
                  <button type="button" onClick={() => setAdvancedPersonaId((current) => (current === persona.id ? null : persona.id))} aria-expanded={advancedOpen} className="rounded-field border border-brand px-3 py-2 text-sm font-bold text-brand">
                    {advancedOpen ? "고급 튜닝 닫기" : "고급 튜닝 열기"}
                  </button>
                </div>
                {advancedOpen ? <AdminFineTuningPanel key={persona.id} personaId={persona.id} personaName={persona.name} /> : null}
              </section>
            </article>
          );
        })}
        {!personas.length ? <p className="rounded-card border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-weak">등록된 가상 리뷰어가 없습니다.</p> : null}
      </section>
    </div>
  );
}
