"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function RejectedReviewResubmission({
  assignmentId,
  rejectionReason,
  hasProofImage,
}: {
  assignmentId: string;
  rejectionReason: string | null;
  hasProofImage: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const fields = new FormData(formElement);
    const screenshot = fields.get("screenshot");
    if (!(screenshot instanceof File) || screenshot.size === 0) {
      setError("수정한 리뷰 캡처를 첨부해 주세요.");
      return;
    }

    const form = new FormData();
    form.append("assignmentId", assignmentId);
    form.append("screenshot", screenshot);
    form.append("resubmissionNote", String(fields.get("resubmissionNote") ?? ""));

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/reviewer/campaigns/complete", {
        method: "POST",
        body: form,
      });
      const data = (await response.json().catch(() => null)) as {
        status?: string;
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(data?.error?.message || "보완 제출을 완료하지 못했습니다.");
      }
      setMessage(
        data?.status === "COMPLETED"
          ? "보완 제출이 승인되어 포인트가 적립되었습니다."
          : data?.status === "REJECTED"
            ? "보완 제출이 다시 반려되었습니다. 반려 사유를 확인해 주세요."
            : "보완 제출이 완료되었습니다. 관리자 재검수를 기다려 주세요.",
      );
      formElement.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "보완 제출을 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="rounded-xl bg-red-50 px-3 py-3 text-xs leading-5 text-danger">
        <strong className="block">반려 사유</strong>
        <span>{rejectionReason || "제출한 리뷰 캡처를 다시 확인해 주세요."}</span>
      </div>

      {hasProofImage ? (
        <a
          href={`/api/reviewer/campaigns/proofs/${encodeURIComponent(assignmentId)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-xs font-bold text-brand"
        >
          기존 제출 파일 확인
        </a>
      ) : null}

      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 h-10 w-full rounded-[9px] bg-brand px-4 text-sm font-bold text-white"
        >
          보완 제출하기
        </button>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-bold text-ink">
            수정한 리뷰 캡처
            <input
              type="file"
              name="screenshot"
              accept="image/png,image/jpeg,image/webp"
              required
              className="mt-2 block w-full rounded-[9px] border border-line bg-surface px-3 py-2 text-xs text-ink-sub file:mr-3 file:rounded-[7px] file:border-0 file:bg-brand-tint file:px-3 file:py-2 file:font-bold file:text-brand"
            />
          </label>
          <label className="block text-sm font-bold text-ink">
            보완 내용 <span className="font-normal text-ink-weak">(선택)</span>
            <textarea
              name="resubmissionNote"
              maxLength={500}
              placeholder="어떤 부분을 수정했는지 남겨 주세요."
              className="mt-2 min-h-20 w-full resize-y rounded-[9px] border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
          </label>
          {error ? <p className="text-xs font-semibold text-danger" role="alert">{error}</p> : null}
          {message ? <p className="text-xs font-semibold text-emerald-700" role="status">{message}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                setError(null);
              }}
              disabled={busy}
              className="h-10 flex-1 rounded-[9px] border border-line text-sm font-bold text-ink-sub"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy}
              className="h-10 flex-1 rounded-[9px] bg-brand text-sm font-bold text-white disabled:opacity-45"
            >
              {busy ? "제출 중…" : "보완 제출하기"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
