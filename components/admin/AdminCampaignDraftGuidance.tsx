"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import {
  CAMPAIGN_REVIEW_DRAFT_INDUSTRIES,
  BLOG_EVIDENCE_DETAIL_LEVELS,
  campaignReviewDraftIndustryLabel,
  type CampaignDraftGuidance,
  type CampaignReviewDraftIndustry,
} from "@/lib/domain/campaign-review-draft";
import { AdminCampaignDraftEvidence } from "@/components/admin/AdminCampaignDraftEvidence";

interface GuidanceResponse {
  guidance: CampaignDraftGuidance;
}

interface ErrorResult {
  error?: { message?: string };
}

export function AdminCampaignDraftGuidance({
  campaignId,
  initialGuidance,
}: {
  campaignId: string;
  initialGuidance: CampaignDraftGuidance;
}) {
  const [industry, setIndustry] = useState<CampaignReviewDraftIndustry | "">(initialGuidance.industry ?? "");
  const [approvedFacts, setApprovedFacts] = useState(initialGuidance.approvedFacts.join("\n"));
  const [bannedTerms, setBannedTerms] = useState(initialGuidance.bannedTerms.join("\n"));
  const [blogEvidenceDetailLevel, setBlogEvidenceDetailLevel] = useState(initialGuidance.blogEvidenceDetailLevel);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const needsAttention =
    !approvedFacts.trim() &&
    initialGuidance.guideKeywords.length === 0 &&
    initialGuidance.reviewExamples.length === 0;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/draft-guidance`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          industry: industry || null,
          approvedFacts: approvedFacts.split("\n"),
          bannedTerms: bannedTerms.split("\n"),
          blogEvidenceDetailLevel,
        }),
      });
      const data = (await res.json().catch(() => null)) as (GuidanceResponse & ErrorResult) | null;
      if (!res.ok) throw new Error(data?.error?.message || "원고 기준을 저장하지 못했습니다.");
      if (!data?.guidance) throw new Error("원고 기준 저장 응답이 비어 있습니다.");
      setIndustry(data.guidance.industry ?? "");
      setApprovedFacts(data.guidance.approvedFacts.join("\n"));
      setBannedTerms(data.guidance.bannedTerms.join("\n"));
      setBlogEvidenceDetailLevel(data.guidance.blogEvidenceDetailLevel);
      setMessage("원고 기준을 저장했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "원고 기준을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`rounded-card border bg-canvas p-3 ${
        needsAttention ? "border-amber-200" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">원고 기준 보정</p>
          <p className="mt-0.5 text-xs text-ink-weak">
            확인된 사실만 원고 근거로 사용합니다. 줄마다 한 항목씩 입력해 주세요.
          </p>
        </div>
        <Button type="button" variant="secondary" loading={saving} onClick={save} className="h-10 shrink-0 px-3 text-xs">
          기준 저장
        </Button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-ink">
          업종
          <select
            value={industry}
            onChange={(event) => setIndustry(event.target.value as CampaignReviewDraftIndustry | "")}
            className="mt-1 h-10 w-full rounded-btn border border-line bg-surface px-3 text-sm font-normal text-ink outline-none focus:border-brand"
          >
            <option value="">자동 분류 사용</option>
            {CAMPAIGN_REVIEW_DRAFT_INDUSTRIES.map((value) => (
              <option key={value} value={value}>
                {campaignReviewDraftIndustryLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <p className="rounded-card border border-line bg-surface p-3 text-xs leading-5 text-ink-weak">
          뷰티·의료 업종은 음식, 메뉴, 식사, 효과 보장 표현을 자동 차단합니다.
        </p>
      </div>

      <label className="mt-3 block text-xs font-semibold text-ink">
        관리자 입력 사실 <span className="font-normal text-ink-weak">(최대 8개)</span>
        <textarea
          value={approvedFacts}
          onChange={(event) => setApprovedFacts(event.target.value)}
          placeholder={"예: 피부 상담 예약제로 운영\n예: 건대입구역 인근"}
          rows={4}
          className="mt-1 w-full rounded-btn border border-line bg-surface p-3 text-sm font-normal leading-5 text-ink outline-none focus:border-brand"
        />
      </label>

      <label className="mt-3 block text-xs font-semibold text-ink">
        블로그 사실카드 정보 수준
        <select
          value={blogEvidenceDetailLevel}
          onChange={(event) => setBlogEvidenceDetailLevel(event.target.value as typeof blogEvidenceDetailLevel)}
          className="mt-1 h-10 w-full rounded-btn border border-line bg-surface px-3 text-sm font-normal text-ink outline-none focus:border-brand"
        >
          {BLOG_EVIDENCE_DETAIL_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level === "EXCLUDE" ? "제외 — 블로그 정보는 사실카드에 사용하지 않음" : null}
              {level === "TITLE_ONLY" ? "제목만 (권장) — 구체적 본문 정보 제외" : null}
              {level === "SUMMARY" ? "요약 포함 — 검색 결과의 짧은 설명까지 사용" : null}
            </option>
          ))}
        </select>
        <span className="mt-1 block font-normal leading-5 text-ink-weak">
          설정 후 자료 분석을 다시 실행하면 새 수준으로 사실카드가 만들어집니다. 기존 카드는 직접 삭제할 수 있습니다.
        </span>
      </label>

      <label className="mt-3 block text-xs font-semibold text-ink">
        금지 표현 <span className="font-normal text-ink-weak">(최대 12개)</span>
        <textarea
          value={bannedTerms}
          onChange={(event) => setBannedTerms(event.target.value)}
          placeholder={"예: 효과 보장\n예: 음식"}
          rows={3}
          className="mt-1 w-full rounded-btn border border-line bg-surface p-3 text-sm font-normal leading-5 text-ink outline-none focus:border-brand"
        />
      </label>

      <div className="mt-3 rounded-card border border-line bg-surface p-3">
        <p className="text-xs font-semibold text-ink">
          시트 리뷰작성 가이드 키워드 <span className="font-normal text-ink-weak">(P열)</span>
        </p>
        {initialGuidance.guideKeywords.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {initialGuidance.guideKeywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand"
              >
                {keyword}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-ink-weak">시트에 등록된 가이드 키워드가 없습니다.</p>
        )}
      </div>

      <div className="mt-3 rounded-card border border-line bg-surface p-3">
        <p className="text-xs font-semibold text-ink">
          시트 리뷰 문구 예시 <span className="font-normal text-ink-weak">(Q열)</span>
        </p>
        {initialGuidance.reviewExamples.length ? (
          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-ink-sub">
            {initialGuidance.reviewExamples.map((example) => (
              <li key={example} className="rounded-[8px] bg-canvas px-2.5 py-2">
                {example}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-ink-weak">시트에 등록된 리뷰 문구 예시가 없습니다.</p>
        )}
      </div>

      <AdminCampaignDraftEvidence campaignId={campaignId} />

      {message ? <p className="mt-3 text-xs font-semibold text-success">{message}</p> : null}
      {error ? <p className="mt-3 text-xs font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
