"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/ui";

export default function NewBusinessPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/business", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, address, googlePlaceId: placeId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.message ?? "등록에 실패했어요");
      router.replace(`/owner/${d.businessId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <h1 className="text-[22px] font-bold text-ink">매장 등록</h1>
      <p className="mt-1 text-[15px] text-ink-sub">상호와 구글맵 정보를 입력하세요.</p>

      <div className="mt-6 space-y-3">
        <TextInput placeholder="상호 (예: 온기담은식당)" value={name} onChange={(e) => setName(e.target.value)} />
        <TextInput placeholder="주소 (선택)" value={address} onChange={(e) => setAddress(e.target.value)} />
        <TextInput
          placeholder="구글 Place ID (선택)"
          value={placeId}
          onChange={(e) => setPlaceId(e.target.value)}
        />
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-6 flex gap-2">
        <Button fullWidth loading={busy} disabled={!name.trim()} onClick={submit}>
          등록하기
        </Button>
        <Button variant="text" onClick={() => router.push("/owner")}>
          취소
        </Button>
      </div>
    </main>
  );
}
