"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { AdminCampaignBlogReference } from "@/lib/domain/campaign-blog-references";

interface BlogReferenceResponse {
  providerConfigured: boolean;
  queries: string[];
  imported: number;
  totalCount: number;
  references: AdminCampaignBlogReference[];
}

interface ErrorResult {
  error?: {
    message?: string;
  };
}

function safeHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function dateLabel(reference: AdminCampaignBlogReference) {
  if (reference.postdate && /^\d{8}$/.test(reference.postdate)) {
    return `${reference.postdate.slice(0, 4)}.${reference.postdate.slice(4, 6)}.${reference.postdate.slice(6, 8)}`;
  }
  return null;
}

export function AdminCampaignBlogReferences({
  campaignId,
  initialReferences,
  initialCount,
}: {
  campaignId: string;
  initialReferences: AdminCampaignBlogReference[];
  initialCount: number;
}) {
  const [references, setReferences] = useState(initialReferences);
  const [count, setCount] = useState(initialCount);
  const [queries, setQueries] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const collect = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/blog-references`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as (BlogReferenceResponse & ErrorResult) | null;
      if (!res.ok) throw new Error(data?.error?.message || "블로그 참고자료를 수집하지 못했습니다.");
      if (!data) throw new Error("블로그 참고자료 응답이 비어 있습니다.");
      if (!data.providerConfigured) {
        setError("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 설정이 필요합니다.");
      }
      setReferences(data.references ?? []);
      setCount(data.totalCount ?? data.references?.length ?? count);
      setQueries(data.queries ?? []);
      setMessage(data.providerConfigured ? `${data.imported.toLocaleString("ko-KR")}건을 확인했습니다.` : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "블로그 참고자료를 수집하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-card border border-line bg-canvas p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">블로그 참고자료</p>
          <p className="mt-0.5 text-xs text-ink-weak">
            원고 생성에 참고할 네이버 블로그 문서를 캠페인별로 저장합니다.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          loading={loading}
          onClick={collect}
          className="h-10 shrink-0 px-3 text-xs"
        >
          참고자료 수집
        </Button>
      </div>

      <div className="mt-3 rounded-card border border-line bg-surface p-3">
        <p className="text-xs text-ink-weak">저장된 참고자료</p>
        <p className="mt-1 text-lg font-bold text-ink">{count.toLocaleString("ko-KR")}건</p>
        {queries.length > 0 ? (
          <p className="mt-1 truncate text-xs text-ink-weak">검색어: {queries.join(" / ")}</p>
        ) : null}
        {message ? <p className="mt-2 text-xs font-semibold text-success">{message}</p> : null}
        {error ? <p className="mt-2 text-xs font-semibold text-danger">{error}</p> : null}
      </div>

      {references.length > 0 ? (
        <div className="mt-3 space-y-2">
          {references.slice(0, 5).map((reference) => {
            const link = safeHttpUrl(reference.link);
            const bloggerLink = safeHttpUrl(reference.bloggerLink);
            return (
              <div key={reference.id} className="rounded-card border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-sm font-semibold text-brand"
                      >
                        {reference.title}
                      </a>
                    ) : (
                      <p className="truncate text-sm font-semibold text-ink">{reference.title}</p>
                    )}
                    <p className="mt-1 truncate text-xs text-ink-weak">
                      {[reference.bloggerName, dateLabel(reference), reference.searchQuery]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {bloggerLink ? (
                    <a href={bloggerLink} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-brand">
                      블로그
                    </a>
                  ) : null}
                </div>
                {reference.description ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink-sub">{reference.description}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-card border border-line bg-surface p-3 text-sm text-ink-weak">
          아직 저장된 블로그 참고자료가 없습니다.
        </p>
      )}
    </div>
  );
}
