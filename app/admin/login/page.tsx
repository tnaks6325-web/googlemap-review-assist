"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/ui";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.message ?? "로그인에 실패했어요");
      router.replace("/admin");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-[22px] font-bold text-ink">관리자 로그인</h1>
      <div className="mt-6 space-y-3">
        <TextInput type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput type="password" placeholder="비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-6">
        <Button fullWidth loading={busy} disabled={!email || !pw} onClick={submit}>
          로그인
        </Button>
      </div>
    </main>
  );
}
