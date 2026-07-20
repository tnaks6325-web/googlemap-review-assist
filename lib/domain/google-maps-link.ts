const ALLOWED_GOOGLE_HOSTS = [
  "google.com",
  "google.co.kr",
  "maps.google.com",
  "maps.app.goo.gl",
  "share.google",
  "goo.gl",
];

export function isAllowedGoogleMapsHost(hostname: string) {
  const host = hostname.toLowerCase();
  return ALLOWED_GOOGLE_HOSTS.some(
    (base) => host === base || host.endsWith(`.${base}`),
  );
}

export function safeGoogleMapsUrl(rawUrl?: string | null) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !isAllowedGoogleMapsHost(url.hostname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
