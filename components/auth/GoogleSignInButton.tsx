"use client";

import { useEffect, useRef, useState } from "react";

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
  onError?: (message: string) => void;
  className?: string;
  label?: string;
  mode?: "login" | "switch";
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: "select_account" }): void;
}

interface GoogleAccountsOAuth2 {
  initTokenClient(options: {
    client_id: string;
    scope: string;
    prompt?: "select_account";
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }): GoogleTokenClient;
}

interface GoogleAccountsId {
  initialize(options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
  }): void;
  disableAutoSelect?(): void;
  renderButton(
    parent: HTMLElement,
    options: {
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with";
      shape?: "rectangular" | "pill" | "circle" | "square";
      width?: number;
      locale?: string;
    },
  ): void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
        oauth2?: GoogleAccountsOAuth2;
      };
    };
  }
}

const GOOGLE_SCRIPT_ID = "google-identity-services";
let googleScriptPromise: Promise<void> | null = null;

function GoogleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-5 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.91-2.258c-.805.54-1.835.86-3.046.86-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.963 10.708A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.168.281-1.708V4.96H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.04l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.578c1.322 0 2.508.454 3.441 1.346l2.582-2.582C13.463.89 11.425 0 9 0A9 9 0 0 0 .956 4.96l3.007 2.332C4.672 5.163 6.656 3.578 9 3.578Z"
      />
    </svg>
  );
}

export function loadGoogleScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id || window.google?.accounts?.oauth2) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Google 로그인 스크립트를 불러오지 못했어요.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google 로그인 스크립트를 불러오지 못했어요."));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

export function GoogleSignInButton({
  onSuccess,
  onError,
  className,
  label = "Google로 계속하기",
  mode = "login",
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [buttonReady, setButtonReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        const configRes = await fetch("/api/auth/google", { cache: "no-store" });
        const config = (await configRes.json().catch(() => ({}))) as {
          configured?: boolean;
          clientId?: string | null;
        };
        if (!config.configured || !config.clientId) {
          if (!cancelled) setFallbackMessage("Google 로그인 설정이 필요합니다.");
          return;
        }
        await loadGoogleScript();
        if (cancelled || !containerRef.current || !window.google?.accounts?.id) return;

        containerRef.current.innerHTML = "";
        window.google.accounts.id.initialize({
          client_id: config.clientId,
          ux_mode: "popup",
          auto_select: false,
          callback: async (response) => {
            if (!response.credential) {
              const message = "Google 로그인 정보를 받지 못했어요.";
              setFallbackMessage(message);
              onError?.(message);
              return;
            }

            setBusy(true);
            setFallbackMessage(null);
            try {
              const res = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ credential: response.credential, mode }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data?.error?.message ?? "Google 로그인에 실패했어요.");
              onSuccess?.();
            } catch (reason) {
              const message =
                reason instanceof Error ? reason.message : "Google 로그인에 실패했어요.";
              setFallbackMessage(message);
              onError?.(message);
            } finally {
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: Math.min(containerRef.current.clientWidth || 360, 400),
          locale: "ko",
        });
        setButtonReady(true);
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : "Google 로그인을 준비하지 못했어요.";
        if (!cancelled) setFallbackMessage(message);
        onError?.(message);
      }
    }

    void setup();
    return () => {
      cancelled = true;
    };
  }, [mode, onError, onSuccess]);

  return (
    <div className={className}>
      {!buttonReady ? (
        <button
          type="button"
          disabled
          data-google-placeholder="true"
          aria-label={label}
          className="grid h-11 w-full grid-cols-[36px_1fr_36px] items-center rounded border border-[#747775] bg-white px-1.5 font-[Roboto,Arial,sans-serif] text-sm font-medium tracking-[0.01em] text-[#1f1f1f] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
        >
          <span className="grid place-items-center">
            <GoogleLogo />
          </span>
          <span>{label}</span>
          <span aria-hidden />
        </button>
      ) : null}
      <div
        ref={containerRef}
        aria-label={label}
        className={`${buttonReady ? "block" : "hidden"} ${busy ? "pointer-events-none opacity-50" : ""}`}
      />
      {busy && <p className="mt-2 text-center text-xs text-ink-weak">Google 로그인 처리 중...</p>}
      {fallbackMessage && (
        <p className="mt-2 text-center text-xs text-danger">{fallbackMessage}</p>
      )}
    </div>
  );
}
