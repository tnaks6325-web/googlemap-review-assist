"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, TextInput } from "@/components/ui";

export default function OwnerLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/owner/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "실패했어요");
      router.replace("/owner");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-[22px] font-bold text-ink">
        {mode === "login" ? "사장님 로그인" : "사장님 가입"}
      </h1>
      <p className="mt-1 text-[15px] text-ink-sub">매장 통계와 리뷰 요청 링크를 관리하세요.</p>

      <div className="mt-8 space-y-3">
        <TextInput
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextInput
          type="password"
          placeholder="비밀번호 (8자 이상)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-6">
        <Button fullWidth loading={busy} disabled={!email || pw.length < 8} onClick={submit}>
          {mode === "login" ? "로그인" : "가입하고 시작하기"}
        </Button>
      </div>

      <button
        className="mt-4 text-sm text-ink-weak hover:text-ink-sub"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError(null);
        }}
      >
        {mode === "login" ? "계정이 없으신가요? 가입하기" : "이미 계정이 있으신가요? 로그인"}
      </button>
    </main>
  );
}
