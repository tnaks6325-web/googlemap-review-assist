"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type LoginPayload =
  | { email: string; password: string }
  | { devBypass: true };

const REMEMBERED_ADMIN_EMAIL = "ia-place:admin-email";
const showDevBypass = process.env.NODE_ENV !== "production";

function IaMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden
      className={
        compact
          ? "grid size-[38px] place-items-center rounded-[13px] bg-brand text-[10px] font-black tracking-[-0.09em] text-white"
          : "grid size-[84px] place-items-center rounded-[28px] border border-white/35 bg-white/15 text-[23px] font-black tracking-[-0.09em] text-white shadow-[inset_0_1px_rgba(255,255,255,0.28),0_20px_55px_rgba(1,48,120,0.18)] backdrop-blur-xl"
      }
    >
      IA
    </span>
  );
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const remembered = window.localStorage.getItem(REMEMBERED_ADMIN_EMAIL);
    if (!remembered) return;
    const frame = window.requestAnimationFrame(() => {
      setEmail(remembered);
      setRememberEmail(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const login = async (payload: LoginPayload, nextPath: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "로그인에 실패했어요");
      }
      if ("email" in payload) {
        if (rememberEmail) {
          window.localStorage.setItem(REMEMBERED_ADMIN_EMAIL, email.trim());
        } else {
          window.localStorage.removeItem(REMEMBERED_ADMIN_EMAIL);
        }
      }
      router.replace(nextPath);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "오류가 발생했어요",
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    void login(
      { email: email.trim(), password },
      "/admin",
    );
  };

  return (
    <main className="grid min-h-dvh min-w-[320px] bg-[#edf2f7] min-[821px]:grid-cols-[minmax(520px,1.15fr)_minmax(430px,0.85fr)]">
      <section
        aria-label="아이에이 플레이스"
        className="relative isolate hidden overflow-hidden bg-[radial-gradient(circle_at_20%_18%,rgba(127,202,255,0.38),transparent_24rem),linear-gradient(145deg,#0755c9_0%,#2878f0_54%,#60a8ff_100%)] text-white min-[821px]:grid min-[821px]:place-items-center"
      >
        <span
          aria-hidden
          className="absolute -right-[260px] -top-[340px] -z-10 size-[720px] rounded-full border border-white/15"
        />
        <span
          aria-hidden
          className="absolute -bottom-[330px] -left-[130px] -z-10 size-[500px] rounded-full border border-white/15"
        />
        <svg
          aria-hidden
          className="absolute inset-0 -z-10 size-full opacity-30"
          viewBox="0 0 900 900"
          preserveAspectRatio="none"
        >
          <path
            d="M-30 610C130 500 270 550 378 420S650 220 930 315"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeDasharray="8 10"
          />
          <path
            d="M70 130C250 280 450 120 860 560"
            fill="none"
            stroke="white"
            strokeWidth="1.4"
            strokeDasharray="5 12"
          />
          <circle cx="378" cy="420" r="10" fill="white" />
          <circle cx="720" cy="285" r="7" fill="white" />
        </svg>
        <div className="flex flex-col items-center gap-6">
          <IaMark />
          <h1 className="text-[clamp(38px,4vw,60px)] font-black leading-none tracking-[-0.065em]">
            아이에이 플레이스
          </h1>
        </div>
      </section>

      <section className="flex min-h-dvh items-center justify-center bg-white/95 px-6 py-[34px] min-[821px]:p-[50px]">
        <form
          id="admin-login"
          className="w-full max-w-[390px]"
          onSubmit={submit}
        >
          <div className="mb-[42px] flex items-center gap-2.5 font-black min-[821px]:hidden">
            <IaMark compact />
            <span>아이에이 플레이스</span>
          </div>

          <p className="text-[11px] font-black tracking-[0.12em] text-brand">
            ADMIN
          </p>
          <h2 className="mt-[11px] text-[30px] font-black tracking-[-0.045em] text-ink">
            관리자 로그인
          </h2>
          <p className="mt-2 text-sm text-ink-weak">
            운영 계정으로 로그인해 주세요.
          </p>

          <div className="mt-8">
            <label
              className="ml-0.5 block text-xs font-extrabold text-ink-sub"
              htmlFor="admin-email"
            >
              이메일
            </label>
            <input
              id="admin-email"
              className="mt-2 h-14 w-full rounded-[14px] border border-line bg-[#fbfcfe] px-4 text-ink outline-none transition placeholder:text-ink-weak focus:border-brand focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,120,240,0.1)]"
              type="text"
              inputMode="email"
              autoComplete="username"
              placeholder="admin@iaplace.kr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="relative mt-[13px]">
            <label
              className="ml-0.5 block text-xs font-extrabold text-ink-sub"
              htmlFor="admin-password"
            >
              비밀번호
            </label>
            <input
              id="admin-password"
              className="mt-2 h-14 w-full rounded-[14px] border border-line bg-[#fbfcfe] px-4 pr-[58px] text-ink outline-none transition placeholder:text-ink-weak focus:border-brand focus:bg-white focus:shadow-[0_0_0_4px_rgba(40,120,240,0.1)]"
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              placeholder="비밀번호 입력"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              aria-label={
                passwordVisible ? "비밀번호 숨기기" : "비밀번호 표시"
              }
              className="absolute bottom-2 right-2 h-10 rounded-[10px] px-3 text-[11px] font-bold text-ink-weak transition hover:bg-brand-tint hover:text-brand"
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? "숨김" : "보기"}
            </button>
          </div>

          <div className="mx-0.5 my-[18px] flex items-center justify-between text-xs text-ink-weak">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(event) => setRememberEmail(event.target.checked)}
                className="size-4 accent-brand"
              />
              이메일 기억하기
            </label>
            <span className="font-extrabold text-brand">로그인 도움</span>
          </div>

          {error ? (
            <p
              className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            aria-busy={busy}
            disabled={busy || !email.trim() || !password}
            className="h-[58px] w-full rounded-[15px] bg-[linear-gradient(135deg,#0f5ed7,#3d91ff)] font-black text-white shadow-[0_13px_26px_rgba(40,120,240,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_17px_31px_rgba(40,120,240,0.28)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {busy ? "계정 확인 중…" : "로그인"}
          </button>

          {showDevBypass ? (
            <button
              type="button"
              disabled={busy}
              className="mt-3 h-12 w-full rounded-[14px] bg-brand-tint text-sm font-extrabold text-brand transition hover:brightness-95 disabled:opacity-50"
              onClick={() =>
                void login({ devBypass: true }, "/admin/campaigns")
              }
            >
              개발용으로 바로 입장
            </button>
          ) : null}

          <div className="mt-6 flex justify-center gap-2 text-[11px] text-[#8995a5]">
            <span aria-hidden>◆</span>
            안전하게 암호화된 연결
          </div>
        </form>
      </section>
    </main>
  );
}
