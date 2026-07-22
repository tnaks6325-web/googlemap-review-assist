export type GoogleLoginPlatform = "android" | "ios" | "other";

export interface GoogleLoginBrowserEnvironment {
  embedded: boolean;
  platform: GoogleLoginPlatform;
}

const EMBEDDED_APP_MARKER =
  /KAKAOTALK|NAVER(?:\(|\/)|DAUMAPPS|FBAN|FBAV|INSTAGRAM|LINE\/|EVERYTIME|BAND\//i;

export function detectGoogleLoginBrowser(userAgent: string): GoogleLoginBrowserEnvironment {
  const platform: GoogleLoginPlatform = /Android/i.test(userAgent)
    ? "android"
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? "ios"
      : "other";
  const androidWebView =
    platform === "android" &&
    (/;\s*wv\)/i.test(userAgent) || /\bwv\b/i.test(userAgent));

  return {
    embedded: androidWebView || EMBEDDED_APP_MARKER.test(userAgent),
    platform,
  };
}

export function buildChromeIntentUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return null;

    const fallbackUrl = encodeURIComponent(url.toString());
    return (
      `intent://${url.host}${url.pathname}${url.search}` +
      `#Intent;scheme=https;package=com.android.chrome;` +
      `S.browser_fallback_url=${fallbackUrl};end`
    );
  } catch {
    return null;
  }
}
