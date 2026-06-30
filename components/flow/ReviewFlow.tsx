"use client";

import { useEffect, useState } from "react";
import { Button, Card, Chip, StarRating, StepBar, TextArea, TextInput } from "@/components/ui";
import { CountUp } from "@/components/ui/CountUp";
import { translate, type Lang } from "@/lib/i18n/messages";

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
  const [lang, setLang] = useState<Lang>("ko");
  useEffect(() => {
    const stored = localStorage.getItem("lang");
    if (stored === "ko" || stored === "en") {
      setLang(stored);
      document.documentElement.lang = stored; // a11y: 스크린리더 언어 일치
    }
  }, []);
  const t = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);
  const toggleLang = () => {
    const next: Lang = lang === "ko" ? "en" : "ko";
    setLang(next);
    localStorage.setItem("lang", next);
    document.documentElement.lang = next;
  };

  const [step, setStep] = useState<Step>("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [requestId, setRequestId] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const [receiptCode, setReceiptCode] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);

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
  const submitReceiptPhoto = () =>
    run(async () => {
      if (!photo) return;
      setPhotoMsg(null);
      const fd = new FormData();
      fd.append("campaignId", campaignId);
      fd.append("image", photo);
      const res = await fetch("/api/receipts/ocr", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.message ?? "업로드에 실패했어요");
      if (d.status === "VERIFIED") {
        setReceiptId(d.receiptId);
        setStep("rating");
      } else {
        setPhotoMsg(t("photoPending"));
      }
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
  const stripNl = (s: string) => s.replace(/\n/g, " ");

  if (finished) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-bold text-ink">{t("thanks")}</p>
        <p className="mt-2 text-[15px] text-ink-sub">
          {t("currentBalance", { balance: balance.toLocaleString("ko-KR") })}
        </p>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-6 pt-5">
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-ink-weak">{businessName}</p>
          <button onClick={toggleLang} className="text-sm text-ink-sub" aria-label="언어 변경 / Change language">
            {t("langName")}
          </button>
        </div>
        {step !== "done" && <StepBar current={stepIndex + 1} total={FLOW.length} />}
      </div>

      <div className="flex-1">
        {step === "phone" && (
          <Step title={t("phoneTitle")} desc={t("phoneDesc")}>
            <TextInput
              inputMode="numeric"
              aria-label={stripNl(t("phoneTitle"))}
              placeholder={t("phonePlaceholder")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Step>
        )}

        {step === "otp" && (
          <Step title={t("otpTitle")} desc={t("otpDesc")}>
            {devCode && (
              <p className="mb-3 rounded-field bg-brand-tint px-3 py-2 text-sm text-brand">
                {t("otpDevCode")}
                <b>{devCode}</b>
              </p>
            )}
            <TextInput
              inputMode="numeric"
              maxLength={6}
              aria-label={stripNl(t("otpTitle"))}
              placeholder={t("otpPlaceholder")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Step>
        )}

        {step === "receipt" && (
          <Step title={t("receiptTitle")} desc={t("receiptDesc")}>
            <TextInput
              aria-label={stripNl(t("receiptTitle"))}
              placeholder={t("receiptPlaceholder")}
              value={receiptCode}
              onChange={(e) => setReceiptCode(e.target.value)}
            />
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-1 text-sm text-ink-sub">{t("photoOr")}</p>
              <p className="mb-2 text-xs text-ink-weak">{t("photoNotice")}</p>
              <input
                type="file"
                accept="image/*"
                aria-label={t("photoSubmit")}
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-ink-sub"
              />
              <Button
                variant="secondary"
                fullWidth
                className="mt-3"
                loading={busy}
                disabled={!photo}
                onClick={submitReceiptPhoto}
              >
                {t("photoSubmit")}
              </Button>
              {photoMsg && <p className="mt-2 text-sm text-ink-sub">{photoMsg}</p>}
            </div>
          </Step>
        )}

        {step === "rating" && (
          <Step title={t("ratingTitle")}>
            <div className="pt-2">
              <StarRating value={rating} onChange={setRating} size={40} />
              {rating > 0 && (
                <p className="mt-3 text-[15px] text-ink-sub">{t("ratingSelected", { n: rating })}</p>
              )}
            </div>
          </Step>
        )}

        {step === "menus" && (
          <Step title={t("menusTitle")} desc={t("menusDesc")}>
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
          <Step title={t("commentTitle")} desc={t("commentDesc")}>
            <TextArea
              aria-label={stripNl(t("commentTitle"))}
              placeholder={t("commentPlaceholder")}
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
              <p className="text-[26px] font-bold tabular-nums text-ink" aria-live="polite">
                +<CountUp value={earned} />
                <span className="ml-0.5 align-baseline text-[0.6em] font-semibold">P</span>
              </p>
            ) : (
              <p className="text-lg font-bold text-ink">{t("alreadyUsed")}</p>
            )}
            <p className="text-[15px] text-ink-sub">{earned > 0 ? t("earnDone") : ""}</p>
            <p className="rounded-card bg-canvas px-4 py-2.5 text-sm text-ink-sub">
              {t("balanceNow", { balance: balance.toLocaleString("ko-KR") })}
            </p>

            {draft && (
              <div className="w-full space-y-2 pt-3 text-left">
                <p className="text-sm font-semibold text-ink-weak">{t("draftLabel")}</p>
                <div className="rounded-card bg-canvas p-4 text-[15px] leading-relaxed text-ink">
                  {draft}
                </div>
                {copied && <p className="text-xs text-brand">{t("copied")}</p>}
              </div>
            )}
          </Card>
        )}
      </div>

      {error && <p className="mb-3 text-center text-sm text-danger">{error}</p>}

      <div className="space-y-1 pt-4">
        {step === "phone" && (
          <Button fullWidth loading={busy} disabled={!phoneOk} onClick={requestOtp}>
            {t("ctaGetOtp")}
          </Button>
        )}
        {step === "otp" && (
          <Button fullWidth loading={busy} disabled={code.length < 6} onClick={verifyOtp}>
            {t("ctaConfirm")}
          </Button>
        )}
        {step === "receipt" && (
          <Button fullWidth loading={busy} disabled={!receiptCode.trim()} onClick={submitReceipt}>
            {t("ctaConfirm")}
          </Button>
        )}
        {step === "rating" && (
          <Button fullWidth disabled={rating === 0} onClick={() => setStep("menus")}>
            {t("ctaNext")}
          </Button>
        )}
        {step === "menus" && (
          <Button fullWidth onClick={() => setStep("comment")}>
            {t("ctaNext")}
          </Button>
        )}
        {step === "comment" && (
          <>
            <p className="mb-2 text-center text-xs text-ink-weak">{t("earnHint")}</p>
            <Button fullWidth loading={busy} onClick={submitFeedback}>
              {t("ctaSubmitEarn")}
            </Button>
          </>
        )}
        {step === "done" && !draft && earned > 0 && (
          <>
            <p className="mb-2 text-center text-xs text-ink-weak">{t("draftPrompt")}</p>
            <Button fullWidth loading={busy} onClick={getDraft}>
              {t("ctaGetDraft")}
            </Button>
            <Button fullWidth variant="text" onClick={() => setFinished(true)}>
              {t("ctaJustFinish")}
            </Button>
          </>
        )}
        {step === "done" && draft && (
          <>
            <Button fullWidth onClick={copyAndOpenMaps}>
              {t("ctaCopyOpenMaps")}
            </Button>
            <Button fullWidth variant="secondary" loading={busy} onClick={getDraft}>
              {t("ctaRegenerate")}
            </Button>
            <Button fullWidth variant="text" onClick={() => setFinished(true)}>
              {t("ctaLater")}
            </Button>
          </>
        )}
        {step === "done" && earned === 0 && !draft && (
          <Button fullWidth variant="text" onClick={() => setFinished(true)}>
            {t("ctaFinish")}
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
