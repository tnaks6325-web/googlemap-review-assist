"use client";

import { useState } from "react";
import {
  AmountText,
  Button,
  Card,
  Chip,
  StarRating,
  StepBar,
  TextArea,
  TextInput,
} from "@/components/ui";

interface Menu {
  id: string;
  name: string;
}
interface Props {
  campaignId: string;
  businessName: string;
  menus: Menu[];
}

type Step = "phone" | "otp" | "receipt" | "rating" | "menus" | "comment" | "done";
const FLOW: Step[] = ["phone", "otp", "receipt", "rating", "menus", "comment"];

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? "요청에 실패했어요");
  return data;
}

export function ReviewFlow({ campaignId, businessName, menus }: Props) {
  const [step, setStep] = useState<Step>("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [requestId, setRequestId] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const [receiptCode, setReceiptCode] = useState("");
  const [receiptId, setReceiptId] = useState("");

  const [rating, setRating] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState("");

  const [feedbackId, setFeedbackId] = useState("");
  const [earned, setEarned] = useState(0);
  const [balance, setBalance] = useState(0);

  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [finished, setFinished] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  const requestOtp = () =>
    run(async () => {
      const d = await post("/api/auth/otp/request", { phone });
      setRequestId(d.requestId);
      setDevCode(d.devCode ?? null);
      setStep("otp");
    });
  const verifyOtp = () =>
    run(async () => {
      await post("/api/auth/otp/verify", { requestId, code });
      setStep("receipt");
    });
  const submitReceipt = () =>
    run(async () => {
      const d = await post("/api/receipts", { campaignId, code: receiptCode });
      setReceiptId(d.receiptId);
      setStep("rating");
    });
  const submitFeedback = () =>
    run(async () => {
      const d = await post("/api/feedback", { receiptId, rating, menuIds: selected, comment });
      setFeedbackId(d.feedbackId);
      setEarned(d.earned ?? 0);
      setBalance(d.balance ?? 0);
      setStep("done");
    });
  const getDraft = () =>
    run(async () => {
      const d = await post("/api/drafts", { feedbackId });
      setDraft(d.text);
    });
  const copyAndOpenMaps = async () => {
    if (draft) {
      try {
        await navigator.clipboard.writeText(draft);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // 클립보드 권한 없으면 그냥 이동
      }
    }
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(businessName)}`,
      "_blank"
    );
  };

  const toggleMenu = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const stepIndex = FLOW.indexOf(step);
  const phoneOk = phone.replace(/[^0-9]/g, "").length >= 10;

  // 마침 화면
  if (finished) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-bold text-ink">감사합니다 🙏</p>
        <p className="mt-2 text-[15px] text-ink-sub">
          현재 적립금 <span className="font-semibold text-ink">{balance.toLocaleString("ko-KR")}P</span>
        </p>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-6 pt-5">
      {/* 헤더 */}
      <div className="mb-6">
        {step !== "done" && <StepBar current={stepIndex + 1} total={FLOW.length} />}
        <p className="mt-3 text-sm text-ink-weak">{businessName}</p>
      </div>

      {/* 본문 */}
      <div className="flex-1">
        {step === "phone" && (
          <Step title={"휴대폰 번호를\n입력해 주세요"} desc="적립을 위해 본인 확인이 필요해요.">
            <TextInput
              inputMode="numeric"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Step>
        )}

        {step === "otp" && (
          <Step title={"인증번호를\n입력해 주세요"} desc="문자로 받은 6자리 숫자를 입력하세요.">
            {devCode && (
              <p className="mb-3 rounded-field bg-brand-tint px-3 py-2 text-sm text-brand">
                개발용 인증번호: <b>{devCode}</b>
              </p>
            )}
            <TextInput
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Step>
        )}

        {step === "receipt" && (
          <Step title={"영수증을\n인증해 주세요"} desc="영수증의 승인번호를 입력하세요.">
            <TextInput
              placeholder="승인번호 입력"
              value={receiptCode}
              onChange={(e) => setReceiptCode(e.target.value)}
            />
          </Step>
        )}

        {step === "rating" && (
          <Step title={"오늘 방문은\n어떠셨나요?"}>
            <div className="pt-2">
              <StarRating value={rating} onChange={setRating} size={40} />
              {rating > 0 && <p className="mt-3 text-[15px] text-ink-sub">{rating}점 선택됨</p>}
            </div>
          </Step>
        )}

        {step === "menus" && (
          <Step title="무엇이 좋았나요?" desc="복수 선택할 수 있어요.">
            <div className="flex flex-wrap gap-2 pt-2">
              {menus.map((m) => (
                <Chip
                  key={m.id}
                  label={m.name}
                  selected={selected.includes(m.id)}
                  onToggle={() => toggleMenu(m.id)}
                />
              ))}
            </div>
          </Step>
        )}

        {step === "comment" && (
          <Step title={"한마디\n남겨주세요"} desc="선택 사항이에요.">
            <TextArea
              placeholder="예) 반찬이 깔끔하고 양이 많아요"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </Step>
        )}

        {step === "done" && (
          <Card className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-success-tint">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="var(--color-success)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            {earned > 0 ? (
              <AmountText value={earned} sign className="text-[26px]" />
            ) : (
              <p className="text-lg font-bold text-ink">이미 참여한 영수증이에요</p>
            )}
            <p className="text-[15px] text-ink-sub">{earned > 0 ? "적립 완료" : ""}</p>
            <p className="rounded-card bg-canvas px-4 py-2.5 text-sm text-ink-sub">
              현재 잔액{" "}
              <span className="font-semibold text-ink">{balance.toLocaleString("ko-KR")}P</span>
            </p>

            {draft && (
              <div className="w-full space-y-2 pt-3 text-left">
                <p className="text-sm font-semibold text-ink-weak">리뷰 초안 (직접 수정 가능)</p>
                <div className="rounded-card bg-canvas p-4 text-[15px] leading-relaxed text-ink">
                  {draft}
                </div>
                {copied && <p className="text-xs text-brand">복사됐어요. 구글맵에 붙여넣기 하세요.</p>}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* 에러 */}
      {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}

      {/* 하단 CTA */}
      <div className="space-y-1 pt-4">
        {step === "phone" && (
          <Button fullWidth loading={busy} disabled={!phoneOk} onClick={requestOtp}>
            인증번호 받기
          </Button>
        )}
        {step === "otp" && (
          <Button fullWidth loading={busy} disabled={code.length < 6} onClick={verifyOtp}>
            확인
          </Button>
        )}
        {step === "receipt" && (
          <Button fullWidth loading={busy} disabled={!receiptCode.trim()} onClick={submitReceipt}>
            확인
          </Button>
        )}
        {step === "rating" && (
          <Button fullWidth disabled={rating === 0} onClick={() => setStep("menus")}>
            다음
          </Button>
        )}
        {step === "menus" && (
          <Button fullWidth onClick={() => setStep("comment")}>
            다음
          </Button>
        )}
        {step === "comment" && (
          <>
            <p className="mb-2 text-center text-xs text-ink-weak">제출하면 바로 적립돼요</p>
            <Button fullWidth loading={busy} onClick={submitFeedback}>
              제출하고 적립받기
            </Button>
          </>
        )}
        {step === "done" && !draft && earned > 0 && (
          <>
            <p className="mb-2 text-center text-xs text-ink-weak">
              남긴 내용으로 리뷰 초안을 만들어 드려요
            </p>
            <Button fullWidth loading={busy} onClick={getDraft}>
              리뷰 초안 받기
            </Button>
            <Button fullWidth variant="text" onClick={() => setFinished(true)}>
              그냥 마치기
            </Button>
          </>
        )}
        {step === "done" && draft && (
          <>
            <Button fullWidth onClick={copyAndOpenMaps}>
              복사하고 구글맵에서 리뷰 쓰기
            </Button>
            <Button fullWidth variant="secondary" loading={busy} onClick={getDraft}>
              다시 생성
            </Button>
            <Button fullWidth variant="text" onClick={() => setFinished(true)}>
              나중에 하기
            </Button>
          </>
        )}
        {step === "done" && earned === 0 && !draft && (
          <Button fullWidth variant="text" onClick={() => setFinished(true)}>
            마치기
          </Button>
        )}
      </div>
    </div>
  );
}

function Step({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="whitespace-pre-line text-[22px] font-bold leading-snug text-ink">{title}</h1>
      {desc && <p className="mt-2 text-[15px] text-ink-sub">{desc}</p>}
      <div className="pt-6">{children}</div>
    </div>
  );
}
