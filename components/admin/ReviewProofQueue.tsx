"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type ReviewProofCheckStatus = "PASS" | "FAIL" | "UNKNOWN";

interface ReviewProofChecks {
  placeName: ReviewProofCheckStatus;
  rating: ReviewProofCheckStatus;
  recency: ReviewProofCheckStatus;
}

interface ReviewProofItem {
  id: string;
  maskedPhone: string;
  businessName: string;
  campaignName: string;
  rewardPoints: number;
  draftText: string | null;
  proofImageUrl: string | null;
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

const checkLabels: Record<ReviewProofCheckStatus, string> = {
  PASS: "통과",
  FAIL: "실패",
  UNKNOWN: "확인 필요",
};

const checkClassNames: Record<ReviewProofCheckStatus, string> = {
  PASS: "border-emerald-100 bg-emerald-50 text-emerald-700",
  FAIL: "border-red-100 bg-red-50 text-danger",
  UNKNOWN: "border-line bg-canvas text-ink-weak",
};

function CheckChip({ label, value }: { label: string; value: ReviewProofCheckStatus }) {
  return (
    <span
      className={`inline-flex items-center justify-between gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${checkClassNames[value]}`}
    >
      <span className="text-ink-weak">{label}</span>
      <span>{checkLabels[value]}</span>
    </span>
  );
}

export function ReviewProofQueue({ items }: { items: ReviewProofItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const act = async (id: string, action: "approve" | "reject") => {
    setBusy(`${id}:${action}`);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/review-proofs/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          note: action === "reject" ? "캡처본에서 리뷰 등록 여부를 확인하기 어렵습니다." : "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "처리에 실패했어요");
      setMessage(action === "approve" ? "검수 승인과 포인트 적립을 완료했어요." : "검수 요청을 반려했어요.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요");
    } finally {
      setBusy(null);
    }
  };

  if (!items.length) {
    return <p className="text-sm text-ink-weak">검수 대기 중인 리뷰 캡처가 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      {message && <p className="rounded-card bg-brand-tint p-3 text-sm font-semibold text-brand">{message}</p>}
      {error && <p className="rounded-card bg-red-50 p-3 text-sm font-semibold text-danger">{error}</p>}
      {items.map((item) => {
        const checks = item.analysisChecks ?? EMPTY_CHECKS;

        return (
          <div key={item.id} className="rounded-card border border-line bg-surface p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-brand">검수 대기</p>
                <h3 className="mt-1 text-base font-bold text-ink">{item.businessName}</h3>
                <p className="mt-1 text-xs text-ink-weak">
                  {item.campaignName} · {item.maskedPhone} · {new Date(item.submittedAt).toLocaleString("ko-KR")}
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
              <div className="flex shrink-0 gap-2">
                <Button
                  className="h-11 px-4 text-sm"
                  loading={busy === `${item.id}:approve`}
                  onClick={() => act(item.id, "approve")}
                >
                  승인 적립
                </Button>
                <Button
                  variant="secondary"
                  className="h-11 px-4 text-sm"
                  loading={busy === `${item.id}:reject`}
                  onClick={() => act(item.id, "reject")}
                >
                  반려
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
              <a
                href={item.proofImageUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-card border border-line bg-canvas"
              >
                {item.proofImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.proofImageUrl} alt="제출된 구글맵 리뷰 캡처" className="h-44 w-full object-cover" />
                ) : (
                  <div className="flex h-44 items-center justify-center text-sm text-ink-weak">캡처 없음</div>
                )}
              </a>
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
    </div>
  );
}
