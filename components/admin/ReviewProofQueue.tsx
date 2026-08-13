"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { formatAdminDateTime } from "@/lib/admin-date-format";
import { filterAdminReviewProofs, type AdminReviewProofFilter } from "@/lib/domain/admin";
import {
  adjacentReviewProofId,
  reviewProofDecisionBody,
  reviewProofReviewerLabel,
} from "@/lib/review-proof-queue";

type ReviewProofCheckStatus = "PASS" | "FAIL" | "UNKNOWN";

interface ReviewProofChecks {
  placeName: ReviewProofCheckStatus;
  rating: ReviewProofCheckStatus;
  recency: ReviewProofCheckStatus;
}

interface ReviewProofItem {
  id: string;
  reviewerName: string | null;
  maskedPhone: string;
  businessName: string;
  campaignName: string;
  rewardPoints: number;
  draftText: string | null;
  hasProofImage: boolean;
  proofOriginalName: string | null;
  extractedText: string | null;
  analysisStatus: string | null;
  analysisReason: string | null;
  analysisProvider: string | null;
  similarity: number | null;
  analysisChecks: ReviewProofChecks | null;
  submittedAt: string;
}

const EMPTY_CHECKS: ReviewProofChecks = {
  placeName: "UNKNOWN",
  rating: "UNKNOWN",
  recency: "UNKNOWN",
};

const STATUS_LABELS: Record<string, string> = { AUTO_APPROVE: "AI 자동 통과", AUTO_REJECT: "AI 미통과", MANUAL_REVIEW: "AI 수동 확인 요청", UNAVAILABLE: "AI 이미지 인식 불가" };
const REJECTION_TEMPLATES = [
  { label: "리뷰 확인 불가", message: "제출된 이미지에서 작성한 리뷰 내용을 확인하기 어렵습니다. Google Maps의 작성 완료 화면 또는 내 리뷰가 보이는 화면으로 다시 제출해 주세요." },
  { label: "매장 확인 불가", message: "제출된 이미지에서 캠페인 매장명을 확인하기 어렵습니다. 해당 매장 페이지와 리뷰가 함께 보이도록 다시 캡처해 주세요." },
  { label: "이미지 불완전", message: "리뷰 작성 완료 여부를 확인할 수 없는 이미지입니다. 화면 전체가 보이도록 다시 캡처해 제출해 주세요." },
] as const;

function CheckChip({ label, value }: { label: string; value: ReviewProofCheckStatus }) {
  const tone = value === "PASS" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : value === "FAIL" ? "border-red-100 bg-red-50 text-danger" : "border-line bg-surface-alt text-ink-weak";
  const state = value === "PASS" ? "통과" : value === "FAIL" ? "실패" : "확인 필요";
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{label} · {state}</span>;
}

export function ReviewProofQueue({ items }: { items: ReviewProofItem[] }) {
  const router = useRouter();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [queue, setQueue] = useState(items);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"approve" | "reject" | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionNote, setRejectionNote] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<AdminReviewProofFilter>("ALL");
  useEffect(() => setQueue(items), [items]);
  const visibleItems = useMemo(() => filterAdminReviewProofs(queue, filter), [filter, queue]);
  const activeItem = activeId ? visibleItems.find((item) => item.id === activeId) ?? null : null;
  const activeReviewerLabel = activeItem ? reviewProofReviewerLabel(activeItem.reviewerName, activeItem.maskedPhone) : null;
  const closeModal = () => { setActiveId(null); setRejectOpen(false); setRejectionNote(""); setSelectedTemplate(null); };
  const openModal = (id: string) => { setError(null); setMessage(null); setActiveId(id); setRejectOpen(false); setRejectionNote(""); setSelectedTemplate(null); };
  const move = (direction: "previous" | "next") => {
    if (!activeItem) return;
    const nextId = adjacentReviewProofId(visibleItems.map((item) => item.id), activeItem.id, direction);
    if (nextId) { setActiveId(nextId); setRejectOpen(false); setRejectionNote(""); setSelectedTemplate(null); }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeItem || event.target === noteRef.current) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); move("previous"); }
      if (event.key === "ArrowRight") { event.preventDefault(); move("next"); }
      if (event.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeItem, visibleItems]);

  const decide = async (action: "approve" | "reject") => {
    if (!activeItem || busyAction) return;
    const note = action === "reject" ? rejectionNote.trim() : "관리자 육안 검수 결과 정상 리뷰로 확인했습니다.";
    if (action === "reject" && !note) { noteRef.current?.focus(); return; }
    setBusyAction(action);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/review-proofs/${encodeURIComponent(activeItem.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reviewProofDecisionBody(action, note)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "검수 결과를 저장하지 못했습니다.");
      const ids = visibleItems.map((item) => item.id);
      const nextId = adjacentReviewProofId(ids, activeItem.id, "next") ?? adjacentReviewProofId(ids, activeItem.id, "previous");
      setQueue((current) => current.filter((item) => item.id !== activeItem.id));
      setActiveId(nextId);
      setRejectOpen(false); setRejectionNote(""); setSelectedTemplate(null);
      setMessage(action === "approve" ? "승인과 포인트 적립을 완료했습니다." : "반려 사유를 리뷰어에게 전송했습니다.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "검수 결과를 저장하지 못했습니다.");
    } finally {
      setBusyAction(null);
    }
  };

  if (!queue.length) {
    return <p className="text-sm text-ink-weak">검수 대기 중인 리뷰 캡처가 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      {message && <p className="rounded-card bg-brand-tint p-3 text-sm font-semibold text-brand">{message}</p>}
      {error && <p className="rounded-card bg-red-50 p-3 text-sm font-semibold text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2" aria-label="검수 대기열 필터">
        {([
          ["ALL", "전체"],
          ["MANUAL_REVIEW", "수동 확인"],
          ["OCR_UNAVAILABLE", "OCR 미인식"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`h-9 rounded-full border px-3 text-xs font-semibold ${
              filter === value
                ? "border-brand bg-brand-tint text-brand"
                : "border-line bg-surface text-ink-weak"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-ink-weak">{visibleItems.length}건 표시</span>
      </div>
      {!visibleItems.length && (
        <p className="rounded-card border border-line bg-canvas p-3 text-sm text-ink-weak">
          선택한 조건에 맞는 검수 대기 건이 없습니다.
        </p>
      )}
      {visibleItems.map((item) => {
        const checks = item.analysisChecks ?? EMPTY_CHECKS;

        return (
          <div key={item.id} className="rounded-card border border-line bg-surface p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-brand">검수 대기</p>
                <h3 className="mt-1 text-base font-bold text-ink">{item.businessName}</h3>
                <p className="mt-1 text-xs text-ink-weak">
                  {item.campaignName} · {item.maskedPhone} · {formatAdminDateTime(item.submittedAt)}
                </p>
                <p className="mt-2 text-sm font-semibold text-ink">
                  {item.rewardPoints.toLocaleString("ko-KR")}P 승인 대기
                </p>
                <p className="mt-1 text-xs text-ink-weak">
                  AI 분석 {item.analysisStatus ?? "대기"} · 유사도{" "}
                  {item.similarity == null ? "-" : `${(item.similarity * 100).toFixed(1)}%`}
                  {item.analysisProvider ? ` · ${item.analysisProvider}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CheckChip label="매장명" value={checks.placeName} />
                  <CheckChip label="별점" value={checks.rating} />
                  <CheckChip label="작성일" value={checks.recency} />
                </div>
              </div>
              <Button className="h-11 px-4 text-sm" onClick={() => openModal(item.id)}>이미지 검수하기</Button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
              <button
                type="button"
                onClick={() => openModal(item.id)}
                disabled={!item.hasProofImage}
                aria-label={`${item.businessName} 리뷰 캡처 검수하기`}
                className="block overflow-hidden rounded-card border border-line bg-canvas text-left disabled:cursor-not-allowed"
              >
                {item.hasProofImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/admin/review-proofs/${item.id}`} alt="제출된 구글맵 리뷰 캡처" className="h-44 w-full object-cover" />
                ) : (
                  <div className="flex h-44 items-center justify-center text-sm text-ink-weak">캡처 없음</div>
                )}
              </button>
              <div className="rounded-card bg-canvas p-3">
                <p className="text-xs font-semibold text-ink-weak">생성 원고</p>
                <p className="mt-2 line-clamp-6 text-sm leading-6 text-ink-sub">
                  {item.draftText || "원고 정보가 없습니다."}
                </p>
                {item.extractedText && (
                  <>
                    <p className="mt-4 text-xs font-semibold text-ink-weak">AI가 읽은 캡처 텍스트</p>
                    <p className="mt-2 line-clamp-4 text-xs leading-5 text-ink-weak">{item.extractedText}</p>
                  </>
                )}
                {item.analysisReason && <p className="mt-3 text-xs text-ink-weak">판정 사유 {item.analysisReason}</p>}
                {item.proofOriginalName && <p className="mt-3 text-xs text-ink-weak">파일명 {item.proofOriginalName}</p>}
              </div>
            </div>
          </div>
        );
      })}
      {activeItem ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label="이미지 검수하기" onMouseDown={(event) => { if (event.currentTarget === event.target) closeModal(); }}>
          <section className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-auto rounded-card bg-surface shadow-2xl">
            <header className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="text-lg font-bold text-ink">이미지 검수하기</h2><button type="button" onClick={closeModal} className="rounded-btn border border-line px-3 py-2 text-xs font-bold">닫기 ×</button></header>
            <div className="grid gap-5 p-5 lg:grid-cols-[1.4fr_1fr]">
              <section className="rounded-field bg-canvas p-2">{activeItem.hasProofImage ? <img src={`/api/admin/review-proofs/${activeItem.id}`} alt={`${activeItem.businessName} 제출 리뷰 확대 이미지`} className="h-auto w-full rounded-[8px]" /> : <div className="flex min-h-60 items-center justify-center text-sm text-ink-weak">이미지를 불러올 수 없습니다.</div>}</section>
              <aside>
                <p className="text-xs font-bold text-ink-weak">AI 검수 결과</p><p className="mt-2 font-bold text-ink">{STATUS_LABELS[activeItem.analysisStatus ?? ""] ?? "분석 대기"}</p><p className="mt-3 text-sm leading-6 text-ink-sub">{activeItem.analysisReason ?? "AI 판정 사유가 아직 준비되지 않았습니다."}</p>
                <p className="mt-5 text-sm font-semibold text-ink">리뷰어 {activeReviewerLabel}</p><p className="mt-1 text-sm text-ink-sub">적립 예정 {activeItem.rewardPoints.toLocaleString("ko-KR")}P</p>
                <div className="mt-5 flex gap-2"><Button variant="secondary" className="flex-1" disabled={Boolean(busyAction)} onClick={() => setRejectOpen((current) => !current)}>반려</Button><Button className="flex-1" loading={busyAction === "approve"} disabled={Boolean(busyAction)} onClick={() => void decide("approve")}>수동 승인</Button></div>
                {rejectOpen ? <section className="mt-4 rounded-card border border-danger/20 bg-red-50/60 p-4"><p className="font-bold text-ink">반려 사유</p><div className="mt-2 flex flex-wrap gap-2">{REJECTION_TEMPLATES.map((template) => <button key={template.label} type="button" onClick={() => { setSelectedTemplate(template.label); setRejectionNote(template.message); }} className={`rounded-btn border px-3 py-2 text-xs font-bold ${selectedTemplate === template.label ? "border-danger text-danger" : "border-line"}`}>{template.label}</button>)}</div><textarea ref={noteRef} value={rejectionNote} maxLength={500} onChange={(event) => { setSelectedTemplate(null); setRejectionNote(event.target.value); }} className="mt-3 min-h-28 w-full rounded-field border border-line p-3 text-sm" placeholder="리뷰어에게 보낼 반려 사유를 입력하세요." /><Button className="mt-3 w-full" loading={busyAction === "reject"} disabled={!rejectionNote.trim() || Boolean(busyAction)} onClick={() => void decide("reject")}>반려 확정 및 메시지 전송</Button></section> : null}
              </aside>
            </div>
            <footer className="flex justify-between border-t border-line px-5 py-3"><button type="button" onClick={() => move("previous")} className="text-sm font-bold">‹ 이전 리뷰</button><button type="button" onClick={() => move("next")} className="text-sm font-bold">다음 리뷰 ›</button></footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
