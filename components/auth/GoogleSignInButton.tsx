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
      };
    };
  }
}

const GOOGLE_SCRIPT_ID = "google-identity-services";
let googleScriptPromise: Promise<void> | null = null;

function loadGoogleScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google 로그인 스크립트를 불러오지 못했어요")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google 로그인 스크립트를 불러오지 못했어요"));
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
              const message = "Google 로그인 토큰을 받지 못했어요.";
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
              if (!res.ok) throw new Error(data?.error?.message ?? "Google 로그인에 실패했어요");
              onSuccess?.();
            } catch (e) {
              const message = e instanceof Error ? e.message : "Google 로그인에 실패했어요";
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
      } catch (e) {
        const message = e instanceof Error ? e.message : "Google 로그인을 준비하지 못했어요";
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
      <div
        ref={containerRef}
        aria-label={label}
        className={busy ? "pointer-events-none opacity-50" : undefined}
      />
      {busy && <p className="mt-2 text-center text-xs text-ink-weak">Google 로그인 처리 중...</p>}
      {fallbackMessage && <p className="mt-2 text-center text-xs text-danger">{fallbackMessage}</p>}
    </div>
  );
}
