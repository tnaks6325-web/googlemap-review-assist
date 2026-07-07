"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, TextArea, TextInput } from "@/components/ui";
import { QrImage } from "@/components/owner/QrImage";

interface Menu {
  id: string;
  name: string;
  category: string | null;
}
interface Campaign {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  _count: { codes: number };
}
interface ExternalPlace {
  id?: string;
  platform: "GOOGLE" | "NAVER";
  externalId: string | null;
  url: string | null;
  name: string;
  address: string | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  receiptReviewCount: number | null;
  matchConfidence: number | null;
  syncedAt?: string | null;
}
interface NaverCandidate {
  title: string;
  link: string;
  category: string | null;
  roadAddress: string | null;
  address: string | null;
  matchConfidence: number;
  rawJson: string | null;
}
interface PlaceIntelligence {
  places: { google: ExternalPlace | null; naver: ExternalPlace | null };
  external: {
    totalReviews: number;
    byPlatform: { GOOGLE: number; NAVER: number };
    byType: { RECEIPT: number; GENERAL: number; BOOKING: number; ORDER: number; UNKNOWN: number };
    keywords: { word: string; count: number }[];
    recent: { id: string; platform: string; reviewType: string; rating: number | null; content: string | null }[];
  };
}

function downloadCsv(filename: string, rows: string[]) {
  const blob = new Blob(["code\n" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ManageBusinessPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const [name, setName] = useState("");
  const [menus, setMenus] = useState<Menu[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [intelligence, setIntelligence] = useState<PlaceIntelligence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const [menuName, setMenuName] = useState("");
  const [menuCat, setMenuCat] = useState("");
  const [googleInput, setGoogleInput] = useState("");
  const [googlePreview, setGooglePreview] = useState<ExternalPlace | null>(null);
  const [naverUrl, setNaverUrl] = useState("");
  const [naverCandidates, setNaverCandidates] = useState<NaverCandidate[]>([]);
  const [selectedNaver, setSelectedNaver] = useState(0);
  const [reviewCsv, setReviewCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastCodes, setLastCodes] = useState<{ slug: string; codes: string[] } | null>(null);

  const load = useCallback(async () => {
    const [res, intelRes] = await Promise.all([
      fetch(`/api/business/${businessId}`),
      fetch(`/api/business/${businessId}/place-intelligence`),
    ]);
    if (!res.ok) {
      setError("매장을 불러올 수 없어요");
      return;
    }
    const d = await res.json();
    setName(d.business.name);
    setMenus(d.menus);
    setCampaigns(d.campaigns);
    if (intelRes.ok) {
      const i = await intelRes.json();
      setIntelligence(i);
      setGoogleInput(i.places.google?.url ?? i.places.google?.externalId ?? "");
      setNaverUrl(i.places.naver?.url ?? "");
    }
  }, [businessId]);

  useEffect(() => {
    const originId = window.setTimeout(() => setOrigin(window.location.origin), 0);
    const loadId = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(originId);
      window.clearTimeout(loadId);
    };
  }, [load]);

  const call = async (url: string, opts?: RequestInit) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, opts);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.message ?? "요청에 실패했어요");
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addMenu = async () => {
    if (!menuName.trim()) return;
    const d = await call(`/api/business/${businessId}/menus`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ menus: [{ name: menuName, category: menuCat || null }] }),
    });
    if (d) {
      setMenus(d.menus);
      setMenuName("");
      setMenuCat("");
    }
  };
  const delMenu = async (menuId: string) => {
    const d = await call(`/api/business/${businessId}/menus/${menuId}`, { method: "DELETE" });
    if (d) setMenus((cur) => cur.filter((m) => m.id !== menuId));
  };
  const addCampaign = async () => {
    const d = await call(`/api/business/${businessId}/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "기본 캠페인" }),
    });
    if (d) load();
  };
  const issueCodes = async (campaignId: string, slug: string) => {
    const d = await call(`/api/business/${businessId}/campaigns/${campaignId}/codes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 10 }),
    });
    if (d) {
      setLastCodes({ slug, codes: d.codes });
      load();
    }
  };
  const downloadAll = async (campaignId: string, slug: string) => {
    const d = await call(`/api/business/${businessId}/campaigns/${campaignId}/codes`);
    if (d) downloadCsv(`codes-${slug}.csv`, d.codes.map((c: { code: string }) => c.code));
  };
  const resolveGoogle = async () => {
    const d = await call(`/api/business/${businessId}/places/google/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ urlOrPlaceId: googleInput }),
    });
    if (d) setGooglePreview(d.place);
  };
  const saveGoogle = async () => {
    const d = await call(`/api/business/${businessId}/places/google`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(googlePreview ? { place: googlePreview } : { urlOrPlaceId: googleInput }),
    });
    if (d) {
      setGooglePreview(null);
      load();
    }
  };
  const findNaver = async () => {
    const d = await call(`/api/business/${businessId}/places/naver/candidates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (d) {
      setNaverCandidates(d.candidates);
      setSelectedNaver(0);
    }
  };
  const saveNaverCandidate = async () => {
    const candidate = naverCandidates[selectedNaver];
    if (!candidate) return;
    const d = await call(`/api/business/${businessId}/places/naver`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidate }),
    });
    if (d) load();
  };
  const saveNaverUrl = async () => {
    if (!naverUrl.trim()) return;
    const d = await call(`/api/business/${businessId}/places/naver`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ naverUrl }),
    });
    if (d) load();
  };
  const syncPlaces = async () => {
    const d = await call(`/api/business/${businessId}/places/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (d) load();
  };
  const importReviews = async () => {
    if (!reviewCsv.trim()) return;
    const d = await call(`/api/business/${businessId}/external-reviews/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: "NAVER", csv: reviewCsv }),
    });
    if (d) {
      setReviewCsv("");
      load();
    }
  };

  const google = intelligence?.places.google;
  const naver = intelligence?.places.naver;

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <Link href="/owner" className="text-sm text-ink-weak hover:text-ink-sub">
        ← 대시보드
      </Link>
      <h1 className="mt-2 text-[22px] font-bold text-ink">{name || "매장 관리"}</h1>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {/* 플레이스 연결 */}
      <section className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-weak">플레이스 연결</h2>
          <Button variant="text" loading={busy} onClick={syncPlaces}>
            동기화
          </Button>
        </div>
        <Card className="space-y-3">
          <div>
            <p className="font-semibold text-ink">Google</p>
            <p className="text-sm text-ink-weak">
              {google ? `${google.name} · ${google.rating ? `${google.rating.toFixed(1)}★` : "평점 없음"}` : "아직 연결되지 않았어요"}
            </p>
          </div>
          <div className="flex gap-2">
            <TextInput
              placeholder="구글플레이스 URL 또는 Place ID"
              value={googleInput}
              onChange={(e) => setGoogleInput(e.target.value)}
            />
            <Button variant="secondary" loading={busy} disabled={!googleInput.trim()} onClick={resolveGoogle}>
              확인
            </Button>
          </div>
          {googlePreview && (
            <div className="rounded-card bg-canvas p-3">
              <p className="font-semibold text-ink">{googlePreview.name}</p>
              <p className="text-sm text-ink-weak">
                {[googlePreview.address, googlePreview.category].filter(Boolean).join(" · ") || "주소 정보 없음"}
              </p>
              <Button className="mt-3" fullWidth loading={busy} onClick={saveGoogle}>
                이 구글 플레이스 연결
              </Button>
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <div>
            <p className="font-semibold text-ink">Naver SmartPlace</p>
            <p className="text-sm text-ink-weak">
              {naver ? `${naver.name} · 매칭 ${naver.matchConfidence ?? "-"}%` : "후보를 찾거나 URL을 직접 저장하세요"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" loading={busy} onClick={findNaver}>
              같은 매장 찾기
            </Button>
            <Button variant="secondary" loading={busy} disabled={!naverUrl.trim()} onClick={saveNaverUrl}>
              URL 저장
            </Button>
          </div>
          <TextInput placeholder="네이버 플레이스 URL" value={naverUrl} onChange={(e) => setNaverUrl(e.target.value)} />
          {naverCandidates.length > 0 && (
            <div className="space-y-2">
              {naverCandidates.map((c, i) => (
                <button
                  key={`${c.title}-${i}`}
                  className={`w-full rounded-card border p-3 text-left text-sm ${
                    selectedNaver === i ? "border-brand bg-brand-tint" : "border-line bg-surface"
                  }`}
                  onClick={() => setSelectedNaver(i)}
                >
                  <span className="font-semibold text-ink">{selectedNaver === i ? "●" : "○"} {c.title}</span>
                  <span className="ml-2 text-brand">{c.matchConfidence}% 일치</span>
                  <span className="mt-1 block text-ink-weak">{[c.roadAddress, c.category].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
              <Button fullWidth loading={busy} onClick={saveNaverCandidate}>
                선택한 네이버 플레이스 연결
              </Button>
            </div>
          )}
        </Card>
      </section>

      {/* 플레이스 인사이트 */}
      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold text-ink-weak">플레이스 인사이트</h2>
        <Card className="space-y-4">
          <p className="text-sm text-ink-weak">내부 피드백과 외부 플레이스 리뷰는 분리해서 보여줘요.</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-card bg-canvas p-3">
              <p className="text-xs text-ink-weak">Google 평점</p>
              <p className="mt-1 text-xl font-bold text-ink">{google?.rating ? `${google.rating.toFixed(1)}★` : "-"}</p>
              <p className="text-xs text-ink-weak">리뷰 {google?.reviewCount ?? 0}개</p>
            </div>
            <div className="rounded-card bg-canvas p-3">
              <p className="text-xs text-ink-weak">Naver 리뷰</p>
              <p className="mt-1 text-xl font-bold text-ink">{intelligence?.external.byPlatform.NAVER ?? 0}건</p>
              <p className="text-xs text-ink-weak">영수증 {intelligence?.external.byType.RECEIPT ?? 0}건</p>
            </div>
            <div className="rounded-card bg-canvas p-3">
              <p className="text-xs text-ink-weak">매장 매칭</p>
              <p className="mt-1 text-xl font-bold text-ink">{naver?.matchConfidence ?? google?.matchConfidence ?? "-"}%</p>
              <p className="text-xs text-ink-weak">상호·주소 기준</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-weak">외부 리뷰 키워드</p>
            {intelligence?.external.keywords.length ? (
              <div className="flex flex-wrap gap-2">
                {intelligence.external.keywords.map((k) => (
                  <span key={k.word} className="rounded-full bg-brand-tint px-3 py-1 text-sm text-brand">
                    {k.word} <span className="tabular-nums">{k.count}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-weak">아직 외부 리뷰 데이터가 없어요</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-weak">최근 외부 리뷰</p>
            {intelligence?.external.recent.length ? (
              <ul className="space-y-2">
                {intelligence.external.recent.slice(0, 4).map((r) => (
                  <li key={r.id} className="text-sm text-ink">
                    <span className="text-brand">{r.platform}</span> · {r.reviewType}
                    {r.rating ? ` · ${r.rating}★` : ""} · {r.content}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-weak">CSV/JSON으로 네이버 영수증 리뷰를 가져오면 표시돼요.</p>
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <p className="font-semibold text-ink">네이버 영수증 리뷰 가져오기</p>
          <p className="text-sm text-ink-weak">자동 크롤링 대신 사업주가 보유한 CSV/JSON 데이터를 업로드하는 방식이에요.</p>
          <TextArea
            placeholder="reviewType,rating,content,authorMasked,publishedAt,externalReviewId"
            value={reviewCsv}
            onChange={(e) => setReviewCsv(e.target.value)}
          />
          <Button fullWidth variant="secondary" loading={busy} disabled={!reviewCsv.trim()} onClick={importReviews}>
            외부 리뷰 가져오기
          </Button>
        </Card>
      </section>

      {/* 메뉴 */}
      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold text-ink-weak">메뉴</h2>
        <Card className="space-y-2">
          {menus.length ? (
            <ul className="divide-y divide-line">
              {menus.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">
                    {m.name}
                    {m.category && <span className="ml-2 text-ink-weak">{m.category}</span>}
                  </span>
                  <button onClick={() => delMenu(m.id)} className="text-ink-weak hover:text-danger">
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-weak">등록된 메뉴가 없어요</p>
          )}
          <div className="flex gap-2 pt-1">
            <TextInput placeholder="메뉴 이름" value={menuName} onChange={(e) => setMenuName(e.target.value)} />
            <TextInput placeholder="분류(선택)" value={menuCat} onChange={(e) => setMenuCat(e.target.value)} className="max-w-32" />
            <Button variant="secondary" loading={busy} disabled={!menuName.trim()} onClick={addMenu}>
              추가
            </Button>
          </div>
        </Card>
      </section>

      {/* 캠페인 */}
      <section className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-weak">리뷰 요청 채널</h2>
          <Button variant="secondary" loading={busy} onClick={addCampaign}>
            + 캠페인 발급
          </Button>
        </div>
        {campaigns.length === 0 && <p className="text-sm text-ink-weak">캠페인을 발급해 QR/링크를 만드세요.</p>}
        {campaigns.map((c) => {
          const link = `${origin}/r/${c.slug}`;
          return (
            <Card key={c.id} className="space-y-3">
              <div className="flex items-start gap-4">
                <QrImage text={link} size={104} />
                <div className="flex-1 space-y-1">
                  <p className="font-semibold text-ink">{c.name}</p>
                  <a href={link} className="block break-all text-sm text-brand">
                    {link}
                  </a>
                  <p className="text-sm text-ink-weak">발급 코드 {c._count.codes}개</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" loading={busy} onClick={() => issueCodes(c.id, c.slug)}>
                  코드 10개 발급
                </Button>
                <Button variant="text" onClick={() => downloadAll(c.id, c.slug)}>
                  전체 코드 CSV
                </Button>
              </div>
              {lastCodes?.slug === c.slug && (
                <div className="rounded-card bg-canvas p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs text-ink-weak">방금 발급한 코드</p>
                    <button
                      className="text-xs text-brand"
                      onClick={() => downloadCsv(`new-codes-${c.slug}.csv`, lastCodes.codes)}
                    >
                      CSV 다운로드
                    </button>
                  </div>
                  <p className="break-all font-mono text-sm text-ink">{lastCodes.codes.join(", ")}</p>
                </div>
              )}
            </Card>
          );
        })}
      </section>
    </main>
  );
}
