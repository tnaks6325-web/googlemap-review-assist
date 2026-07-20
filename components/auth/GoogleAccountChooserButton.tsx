"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleScript } from "@/components/auth/GoogleSignInButton";
import { googleAccountChooserOptions } from "@/lib/google-account-chooser";

interface GoogleAccountChooserButtonProps {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: "select_account" }): void;
}

export function GoogleAccountChooserButton({
  onSuccess,
  onError,
}: GoogleAccountChooserButtonProps) {
  const tokenClientRef = useRef<TokenClient | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        const configResponse = await fetch("/api/auth/google", { cache: "no-store" });
        const config = (await configResponse.json().catch(() => ({}))) as {
          configured?: boolean;
          clientId?: string | null;
        };
        if (!config.configured || !config.clientId) {
          throw new Error("Google 로그인 설정이 필요합니다.");
        }

        await loadGoogleScript();
        const oauth2 = window.google?.accounts?.oauth2;
        if (cancelled) return;
        if (!oauth2) {
          throw new Error("Google 계정 선택 기능을 불러오지 못했습니다.");
        }

        tokenClientRef.current = oauth2.initTokenClient({
          ...googleAccountChooserOptions(config.clientId),
          callback: async (response) => {
            if (!response.access_token) {
              const errorMessage = "Google 계정을 선택하지 못했습니다.";
              if (!cancelled) setMessage(errorMessage);
              onError?.(errorMessage);
              return;
            }

            if (!cancelled) {
              setBusy(true);
              setMessage(null);
            }
            try {
              const authResponse = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  accessToken: response.access_token,
                  mode: "switch",
                }),
              });
              const data = await authResponse.json().catch(() => ({}));
              if (!authResponse.ok) {
                throw new Error(data?.error?.message ?? "Google 계정 전환에 실패했습니다.");
              }
              onSuccess?.();
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Google 계정 전환에 실패했습니다.";
              if (!cancelled) setMessage(errorMessage);
              onError?.(errorMessage);
            } finally {
              if (!cancelled) setBusy(false);
            }
          },
          error_callback: (error) => {
            if (error.type === "popup_closed") return;
            const errorMessage = "Google 계정 선택창을 열지 못했습니다.";
            if (!cancelled) setMessage(errorMessage);
            onError?.(errorMessage);
          },
        });
        if (!cancelled) setReady(true);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Google 로그인을 준비하지 못했습니다.";
        if (!cancelled) setMessage(errorMessage);
        onError?.(errorMessage);
      }
    }

    void setup();
    return () => {
      cancelled = true;
      tokenClientRef.current = null;
    };
  }, [onError, onSuccess]);

  return (
    <div>
      <button
        type="button"
        disabled={!ready || busy}
        onClick={() => tokenClientRef.current?.requestAccessToken({ prompt: "select_account" })}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-line bg-white px-4 py-3.5 text-sm font-bold text-brand transition hover:border-brand/40 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60"
      >
        <span aria-hidden className="text-xl font-normal leading-none">
          +
        </span>
        {busy ? "계정 전환 중..." : "다른 계정 추가"}
      </button>
      {message && <p className="mt-2 text-center text-xs text-danger">{message}</p>}
    </div>
  );
}
