import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildChromeIntentUrl,
  detectGoogleLoginBrowser,
} from "@/lib/google-login-browser";

describe("Google login browser compatibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("detects Android app WebViews that Google Identity Services blocks", () => {
    const result = detectGoogleLoginBrowser(
      "Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 " +
        "Version/4.0 Chrome/138.0 Mobile Safari/537.36 KAKAOTALK 25.5.0",
    );

    expect(result).toEqual({ embedded: true, platform: "android" });
  });

  it("does not classify standalone Android Chrome as an embedded browser", () => {
    const result = detectGoogleLoginBrowser(
      "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 " +
        "Chrome/138.0 Mobile Safari/537.36",
    );

    expect(result).toEqual({ embedded: false, platform: "android" });
  });

  it("detects known iOS in-app browsers without blocking Safari", () => {
    expect(
      detectGoogleLoginBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 " +
          "Mobile/15E148 KAKAOTALK 25.5.0",
      ),
    ).toEqual({ embedded: true, platform: "ios" });

    expect(
      detectGoogleLoginBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 " +
          "Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ embedded: false, platform: "ios" });
  });

  it("builds a Chrome intent with a safe HTTPS fallback", () => {
    const url = "https://googlemap-review-assist.vercel.app/campaigns?source=kakao";
    const intent = buildChromeIntentUrl(url);

    expect(intent).toContain(
      "intent://googlemap-review-assist.vercel.app/campaigns?source=kakao#Intent;scheme=https;package=com.android.chrome;",
    );
    expect(intent).toContain(`S.browser_fallback_url=${encodeURIComponent(url)};end`);
    expect(buildChromeIntentUrl("javascript:alert(1)")).toBeNull();
  });

  it("allows a fresh Google script request after a previous load failure", async () => {
    const appendedScripts: Array<Record<string, unknown>> = [];
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => ({ remove: vi.fn() })),
      head: {
        appendChild: vi.fn((script: { onerror?: () => void }) => {
          appendedScripts.push(script as Record<string, unknown>);
          queueMicrotask(() => script.onerror?.());
        }),
      },
    });

    const { loadGoogleScript } = await import("@/components/auth/GoogleSignInButton");

    await expect(loadGoogleScript()).rejects.toThrow("Google 로그인 스크립트");
    await expect(loadGoogleScript()).rejects.toThrow("Google 로그인 스크립트");
    expect(appendedScripts).toHaveLength(2);
  });
});
