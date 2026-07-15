"use client";

import { useEffect, useMemo, useState } from "react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Button, Card, StepBar, TextInput } from "@/components/ui";
import { formatPhoneInput, isFixedKoreanMobilePhone } from "@/lib/phone";

interface AssignedCampaign {
  id: string;
  slug: string;
  campaignName: string;
  businessName: string;
  address: string | null;
  category: string | null;
  googleMapsUrl: string;
  rating: number | null;
  reviewCount: number | null;
  rewardPoints: number;
}

interface Props {
  initialCampaign: AssignedCampaign;
  initialAvailableCount: number;
  initialTotalRewardPoints: number;
  initialCategoryCounts: CategoryCount[];
  cooldownDays: number;
}

type Step = "phone" | "otp" | "summary" | "assigned" | "draft" | "complete";

const FLOW: Step[] = ["phone", "otp", "summary", "assigned", "draft", "complete"];
const SHOW_DEV_OTP_BYPASS = process.env.NODE_ENV !== "production";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? "요청에 실패했어요");
  return data as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? "요청에 실패했어요");
  return data as T;
}

function formatPoints(points: number) {
  return points.toLocaleString("ko-KR");
}

/*
function buildCampaignDraft(campaign: AssignedCampaign) {
  const category = campaign.category ? `${campaign.category} 매장` : "매장";
  return [
    `${campaign.businessName}에 방문했습니다.`,
    `${category}답게 이용하기 편했고 전체적으로 만족스러운 시간이었습니다.`,
    "다음에도 근처에 오면 다시 들르고 싶은 곳이에요.",
  ].join(" ");
}

*/
interface AvailabilityResponse {
  availableCount: number;
  totalRewardPoints: number;
  cooldownDays: number;
  categoryCounts?: CategoryCount[];
}

interface AssignResponse extends AvailabilityResponse {
  assignmentId: string | null;
  assignedCampaign: AssignedCampaign | null;
}

interface CompleteResponse {
  assignmentId: string;
  status: string;
  earned: number;
  balance: number;
  alreadyCompleted?: boolean;
  paidAmount?: number;
  pendingApproval?: boolean;
  hasProofImage?: boolean;
  analysis?: {
    status: string;
    similarity: number;
    reason: string;
  } | null;
}

interface DraftResponse {
  assignmentId: string;
  text: string;
  provider: string;
  model: string;
  sourceGroupCount: number;
  version: number;
  reused: boolean;
}

interface CategoryCount {
  category: string;
  count: number;
}

export function ReviewFlow({
  initialCampaign,
  initialAvailableCount,
  initialTotalRewardPoints,
  initialCategoryCounts,
  cooldownDays: initialCooldownDays,
}: Props) {
  const [step, setStep] = useState<Step>("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [requestId, setRequestId] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [availableCount, setAvailableCount] = useState(initialAvailableCount);
  const [totalRewardPoints, setTotalRewardPoints] = useState(initialTotalRewardPoints);
  const [categoryCounts, setCategoryCounts] = useState(initialCategoryCounts);
  const [cooldownDays, setCooldownDays] = useState(initialCooldownDays);
  const [assignedCampaign, setAssignedCampaign] = useState<AssignedCampaign | null>(null);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftMeta, setDraftMeta] = useState<DraftResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [completion, setCompletion] = useState<CompleteResponse | null>(null);
  const [screenshot, setScreenshot] = useState<File | null>(null);

  useEffect(() => {
    document.documentElement.lang = "ko";
  }, []);

  const currentCampaign = assignedCampaign ?? initialCampaign;
  const phoneOk = isFixedKoreanMobilePhone(phone);
  const stepIndex = Math.max(FLOW.indexOf(step), 0);
  const ctaPoints = formatPoints(totalRewardPoints);

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

  const applyAvailability = (data: AvailabilityResponse) => {
    setAvailableCount(data.availableCount);
    setTotalRewardPoints(data.totalRewardPoints);
    setCategoryCounts(data.categoryCounts ?? []);
    setCooldownDays(data.cooldownDays);
  };

  const loadAvailability = async () => {
    const data = await getJson<AvailabilityResponse>("/api/reviewer/campaigns/available");
    applyAvailability(data);
    setStep("summary");
  };

  const requestOtp = () =>
    run(async () => {
      const data = await postJson<{ requestId: string; devCode?: string }>("/api/auth/otp/request", { phone });
      setRequestId(data.requestId);
      setDevCode(data.devCode ?? null);
      setStep("otp");
    });

  const verifyOtp = () =>
    run(async () => {
      await postJson("/api/auth/otp/verify", { requestId, code, phone });
      await loadAvailability();
    });

  const continueWithGoogle = () => {
    void run(loadAvailability);
  };

  const devBypassOtp = () =>
    run(async () => {
      await postJson("/api/auth/otp/verify", { requestId, code: "000000", phone });
      setCode("000000");
      await loadAvailability();
    });

  const assignCampaign = () =>
    run(async () => {
      const data = await postJson<AssignResponse>("/api/reviewer/campaigns/assign", {});
      applyAvailability(data);
      setAssignmentId(data.assignmentId);
      setAssignedCampaign(data.assignedCampaign);
      setDraft("");
      setDraftMeta(null);
      setCompletion(null);
      if (!data.assignedCampaign) {
        setError("지금 참여 가능한 캠페인이 없어요");
        return;
      }
      setStep("assigned");
    });

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const requestDraft = (regenerate = false) =>
    run(async () => {
      if (!assignmentId) {
        setError("참여 정보를 확인해 주세요.");
        return;
      }
      const data = await postJson<DraftResponse>("/api/reviewer/campaigns/draft", {
        assignmentId,
        regenerate,
      });
      setDraft(data.text);
      setDraftMeta(data);
      setScreenshot(null);
      await copyText(data.text);
      setStep("draft");
    });

  const generateDraft = () => requestDraft(false);

  const completeAssignment = () =>
    run(async () => {
      if (!assignmentId) {
        setError("참여 정보를 확인해 주세요");
        return;
      }
      if (!screenshot) {
        setError("구글맵 리뷰 캡처본을 첨부해 주세요");
        return;
      }
      const form = new FormData();
      form.append("assignmentId", assignmentId);
      form.append("draftText", draft);
      form.append("screenshot", screenshot);
      const res = await fetch("/api/reviewer/campaigns/complete", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "검수 요청에 실패했어요");
      setCompletion(data);
      setStep("complete");
    });

  const refreshForNextCampaign = () =>
    run(async () => {
      setAssignedCampaign(null);
      setAssignmentId(null);
      setDraft("");
      setDraftMeta(null);
      setScreenshot(null);
      setCompletion(null);
      await loadAvailability();
    });

  const headerTitle = useMemo(() => {
    if (step === "phone" || step === "otp") return "리뷰어 참여";
    if (step === "summary") return "캠페인 배정";
    if (step === "assigned") return "캠페인 배정 완료";
    if (step === "complete") return "적립 완료";
    return currentCampaign.businessName;
  }, [currentCampaign.businessName, step]);

  const proofApproved = completion?.status === "COMPLETED";
  const proofRejected = completion?.status === "REJECTED";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-canvas px-5 pb-6 pt-5">
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-ink-weak">{headerTitle}</p>
          <p className="text-xs font-medium text-ink-weak">{cooldownDays}일 중복 제한</p>
        </div>
        <StepBar current={stepIndex + 1} total={FLOW.length} />
      </div>

      <div className="flex-1">
        {step === "phone" && (
          <Step title="휴대폰 번호를 입력해 주세요" desc="참여 가능 캠페인을 사용자별로 확인해요.">
            <GoogleSignInButton className="mb-5" onSuccess={continueWithGoogle} onError={setError} />
            <div className="mb-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs font-medium text-ink-weak">또는 휴대폰 인증</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <TextInput
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={13}
              pattern="010-[0-9]{4}-[0-9]{4}"
              aria-label="휴대폰 번호"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
            />
            <SummaryStrip
              className="mt-5"
              count={availableCount}
              points={totalRewardPoints}
              cooldownDays={cooldownDays}
            />
          </Step>
        )}

        {step === "otp" && (
          <Step title="인증번호를 입력해 주세요" desc="문자로 받은 6자리 숫자를 입력하세요.">
            {devCode && (
              <p className="mb-3 rounded-field bg-brand-tint px-3 py-2 text-sm text-brand">
                개발용 인증번호 <b>{devCode}</b>
              </p>
            )}
            <TextInput
              inputMode="numeric"
              maxLength={6}
              aria-label="인증번호"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            {SHOW_DEV_OTP_BYPASS && (
              <Button variant="secondary" fullWidth className="mt-3" loading={busy} onClick={devBypassOtp}>
                개발용으로 바로 진행
              </Button>
            )}
          </Step>
        )}

        {step === "summary" && (
          <Step
            title={`참여할 수 있는 캠페인이 ${availableCount.toLocaleString("ko-KR")}개 있습니다`}
            desc="캠페인 목록은 공개하지 않고, 참여 가능한 캠페인 중 하나를 랜덤으로 배정해요."
          >
            <SummaryStrip count={availableCount} points={totalRewardPoints} cooldownDays={cooldownDays} />
            <CategorySummary categoryCounts={categoryCounts} />
            <Card className="mt-4 bg-surface">
              <p className="text-sm font-semibold text-ink">배정 기준</p>
              <p className="mt-2 text-sm leading-6 text-ink-sub">
                같은 Google 지도 장소는 최근 {cooldownDays}일 안에 다시 참여할 수 없어요. 캠페인별 보상 포인트가
                다를 수 있어 총 적립 가능 포인트는 참여 가능한 캠페인의 보상 합계로 계산합니다.
              </p>
            </Card>
          </Step>
        )}

        {step === "assigned" && (
          <Step title="캠페인이 배정됐어요" desc="방문 후 Google 지도 리뷰 작성에 사용할 초안을 만들 수 있어요.">
            <CampaignCard campaign={currentCampaign} assignmentId={assignmentId} showPlaceDetails={false} />
          </Step>
        )}

        {step === "draft" && (
          <Step title="원고가 복사됐어요" desc="아래 버튼으로 Google 지도를 열고 리뷰 작성란에 붙여넣으세요.">
            <CampaignCard campaign={currentCampaign} assignmentId={assignmentId} />
            <Card className="mt-4 space-y-2">
              <p className="text-sm font-semibold text-ink-weak">복사된 원고</p>
              <p className="text-[15px] leading-7 text-ink">{draft}</p>
              {draftMeta && (
                <p className="text-xs text-ink-weak">
                  원고자료 {draftMeta.sourceGroupCount}/4 · 생성 {draftMeta.version}/3회
                </p>
              )}
              {copied && <p className="text-xs font-medium text-brand">클립보드에 복사했어요.</p>}
            </Card>
          </Step>
        )}

        {step === "complete" && (
          <Step
            title={
              completion?.alreadyCompleted
                ? "이미 적립된 참여예요"
                : proofApproved
                  ? "AI 검수로 포인트가 적립됐어요"
                  : proofRejected
                    ? "AI 검수에서 반려됐어요"
                    : "검수 요청이 접수됐어요"
            }
            desc={
              completion?.alreadyCompleted
                ? "이미 승인되어 추가 지급은 발생하지 않았어요."
                : proofApproved
                  ? "캡처본의 리뷰 문구가 생성 원고와 충분히 유사해 자동 승인됐어요."
                  : proofRejected
                    ? "캡처본에서 생성 원고와 일치하는 리뷰를 확인하지 못했어요."
                    : "관리자가 캡처본을 확인한 뒤 승인하면 포인트가 적립돼요."
            }
          >
            <Card className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-brand">
                  {completion?.alreadyCompleted || proofApproved ? "참여 완료" : proofRejected ? "반려" : "검수 대기"}
                </p>
                <p className="mt-1 text-3xl font-bold text-ink">
                  +{formatPoints(completion?.earned ?? 0)}P
                </p>
                {completion?.alreadyCompleted ? (
                  <p className="mt-2 text-sm text-ink-weak">
                    같은 참여번호로 이미 적립되어 추가 지급은 발생하지 않았어요.
                  </p>
                ) : proofApproved ? (
                  <p className="mt-2 text-sm text-ink-weak">
                    자동 검수 승인으로 포인트가 즉시 지급됐어요.
                  </p>
                ) : proofRejected ? (
                  <p className="mt-2 text-sm text-ink-weak">
                    다른 캡처본으로 다시 제출하려면 새 캠페인 참여가 필요해요.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-ink-weak">
                    지금은 포인트가 지급되지 않았고, 승인 후 자동으로 적립됩니다.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Metric
                  label={proofApproved ? "지급 포인트" : "승인 후 적립"}
                  value={`${formatPoints(proofApproved ? (completion?.paidAmount ?? completion?.earned ?? 0) : currentCampaign.rewardPoints)}P`}
                />
                <Metric label="현재 잔액" value={`${formatPoints(completion?.balance ?? 0)}P`} />
              </div>
              {completion?.analysis && (
                <p className="rounded-card bg-surface p-3 text-xs leading-5 text-ink-weak">
                  AI 유사도 {(completion.analysis.similarity * 100).toFixed(1)}% · {completion.analysis.reason}
                </p>
              )}
              {completion?.hasProofImage && assignmentId && (
                <a
                  href={`/api/reviewer/campaigns/proofs/${assignmentId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-brand"
                >
                  제출한 캡처 확인
                </a>
              )}
              {assignmentId && <p className="text-xs text-ink-weak">참여번호 {assignmentId.slice(-8).toUpperCase()}</p>}
            </Card>
          </Step>
        )}
      </div>

      {error && <p className="mb-3 rounded-field bg-danger/10 px-3 py-2 text-center text-sm text-danger">{error}</p>}

      <div className="space-y-2 pt-4">
        {step === "otp" && (
          <Button fullWidth variant="secondary" disabled={busy} onClick={() => setStep("phone")}>
            이전
          </Button>
        )}
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
        {step === "summary" && (
          <>
            <p className="text-center text-xs font-medium text-ink-weak">
              오늘 가능한 적립금 {ctaPoints}P · {availableCount.toLocaleString("ko-KR")}건 중 랜덤 배정
            </p>
            <Button fullWidth loading={busy} disabled={availableCount < 1} onClick={assignCampaign}>
              참여하고 총 {ctaPoints}P 적립받기
            </Button>
          </>
        )}
        {step === "assigned" && (
          <Button fullWidth loading={busy} onClick={generateDraft}>
            원고 생성하고 복사하기
          </Button>
        )}
        {step === "draft" && (
          <>
            <MapsButton href={currentCampaign.googleMapsUrl} label="구글맵 열기" variant="secondary" />
            <label className="block rounded-card border border-line bg-surface p-3 text-sm">
              <span className="block font-semibold text-ink">구글맵 리뷰 캡처본</span>
              <span className="mt-1 block text-xs leading-5 text-ink-weak">
                리뷰 등록 후 작성 완료 화면이나 내 리뷰가 보이는 화면을 첨부해 주세요.
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="mt-3 block w-full text-sm text-ink-sub"
                onChange={(event) => setScreenshot(event.target.files?.[0] ?? null)}
              />
              {screenshot && (
                <span className="mt-2 block text-xs font-semibold text-brand">{screenshot.name}</span>
              )}
            </label>
            <ReviewProofGuide />
            <Button fullWidth loading={busy} disabled={!screenshot} onClick={completeAssignment}>
              캡처 제출하고 검수 요청
            </Button>
            <Button
              fullWidth
              variant="secondary"
              loading={busy}
              disabled={(draftMeta?.version ?? 0) >= 3}
              onClick={() => requestDraft(true)}
            >
              원고 다시 생성
            </Button>
            <Button fullWidth variant="secondary" loading={busy} onClick={() => copyText(draft)}>
              원고 다시 복사
            </Button>
            <Button fullWidth variant="text" loading={busy} onClick={refreshForNextCampaign}>
              다른 캠페인 참여하기
            </Button>
          </>
        )}
        {step === "complete" && (
          <Button fullWidth loading={busy} onClick={refreshForNextCampaign}>
            다른 캠페인 참여하기
          </Button>
        )}
      </div>
    </main>
  );
}

function ReviewProofGuide() {
  return (
    <details className="rounded-card border border-line bg-white px-3 py-2 text-sm">
      <summary className="cursor-pointer select-none font-semibold text-brand">캡처 예시 보기</summary>
      <div className="mt-3 grid gap-3">
        <figure className="overflow-hidden rounded-xl border border-line bg-surface">
          <img
            src="/review-proof-guides/before-readmore.png"
            alt="더보기 전 리뷰 캡처 예시"
            className="max-h-80 w-full object-contain"
            loading="lazy"
          />
          <figcaption className="border-t border-line px-3 py-2 text-xs text-ink-weak">
            더보기 전: 작성한 리뷰 첫 문장이 보이면 됩니다.
          </figcaption>
        </figure>
        <figure className="overflow-hidden rounded-xl border border-line bg-surface">
          <img
            src="/review-proof-guides/after-readmore.png"
            alt="더보기 후 전체 리뷰 캡처 예시"
            className="max-h-80 w-full object-contain"
            loading="lazy"
          />
          <figcaption className="border-t border-line px-3 py-2 text-xs text-ink-weak">
            더보기 후: 전체 리뷰가 보이는 화면도 가능합니다.
          </figcaption>
        </figure>
      </div>
    </details>
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
    <section>
      <h1 className="whitespace-pre-line text-[22px] font-bold leading-snug text-ink">{title}</h1>
      {desc && <p className="mt-2 text-[15px] leading-6 text-ink-sub">{desc}</p>}
      <div className="pt-6">{children}</div>
    </section>
  );
}

function CategorySummary({ categoryCounts }: { categoryCounts: CategoryCount[] }) {
  if (categoryCounts.length === 0) return null;
  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">참여 가능 업종</p>
        <p className="text-xs text-ink-weak">Google 업종 기준</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {categoryCounts.map((item) => (
          <span
            key={item.category}
            className="rounded-full bg-brand-tint px-3 py-1.5 text-sm font-semibold text-brand"
          >
            {item.category} {item.count.toLocaleString("ko-KR")}개
          </span>
        ))}
      </div>
    </Card>
  );
}

function SummaryStrip({
  count,
  points,
  cooldownDays,
  className,
}: {
  count: number;
  points: number;
  cooldownDays: number;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-3 gap-2 ${className ?? ""}`}>
      <Metric label="참여 가능" value={`${count.toLocaleString("ko-KR")}개`} />
      <Metric label="적립 합계" value={`${formatPoints(points)}P`} />
      <Metric label="중복 제한" value={`${cooldownDays}일`} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-surface p-3">
      <p className="text-xs text-ink-weak">{label}</p>
      <p className="mt-1 text-base font-bold text-ink">{value}</p>
    </div>
  );
}

function CampaignCard({
  campaign,
  assignmentId,
  showPlaceDetails = true,
}: {
  campaign: AssignedCampaign;
  assignmentId: string | null;
  showPlaceDetails?: boolean;
}) {
  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-brand">배정 완료</p>
        {showPlaceDetails ? (
          <>
            <h2 className="mt-1 text-xl font-bold leading-snug text-ink">{campaign.businessName}</h2>
            <p className="mt-1 text-sm leading-5 text-ink-weak">
              {[campaign.category, campaign.address].filter(Boolean).join(" · ") || campaign.campaignName}
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-1 text-xl font-bold leading-snug text-ink">참여 캠페인이 준비됐어요</h2>
            <p className="mt-1 text-sm leading-5 text-ink-weak">
              원고를 생성하면 다음 단계에서 리뷰 등록을 진행할 수 있어요.
            </p>
          </>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Metric label="이번 적립" value={`${formatPoints(campaign.rewardPoints)}P`} />
      </div>
      {assignmentId && <p className="text-xs text-ink-weak">참여번호 {assignmentId.slice(-8).toUpperCase()}</p>}
    </Card>
  );
}

function MapsButton({
  href,
  label,
  variant = "primary",
}: {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const classes =
    variant === "primary"
      ? "bg-brand text-white hover:bg-brand-pressed"
      : "bg-brand-tint text-brand hover:brightness-95";
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex h-[52px] w-full select-none items-center justify-center rounded-btn px-5 text-base font-medium transition active:scale-[0.98] ${classes}`}
    >
      {label}
    </a>
  );
}
