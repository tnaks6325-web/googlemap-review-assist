"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, Card, TextInput } from "@/components/ui";
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
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const [menuName, setMenuName] = useState("");
  const [menuCat, setMenuCat] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastCodes, setLastCodes] = useState<{ slug: string; codes: string[] } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/business/${businessId}`);
    if (!res.ok) {
      setError("매장을 불러올 수 없어요");
      return;
    }
    const d = await res.json();
    setName(d.business.name);
    setMenus(d.menus);
    setCampaigns(d.campaigns);
  }, [businessId]);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
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

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <a href="/owner" className="text-sm text-ink-weak hover:text-ink-sub">
        ← 대시보드
      </a>
      <h1 className="mt-2 text-[22px] font-bold text-ink">{name || "매장 관리"}</h1>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

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
