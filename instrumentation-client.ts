import { isHydrationErrorMessage } from "@/lib/browser-error-detection";

type ReportKind = "error" | "unhandled-rejection" | "hydration";

const reported = new Set<string>();

function submitClientError(kind: ReportKind, value: unknown) {
  try {
    const error = value instanceof Error ? value : new Error(String(value ?? "Unknown browser error"));
    const hydration = /hydration|server rendered html|hydrated/i.test(error.message);
    const reportKind: ReportKind = hydration ? "hydration" : kind;
    const fingerprint = `${reportKind}:${location.pathname}:${error.name}:${error.message}`.slice(0, 1_500);
    if (reported.has(fingerprint)) return;
    reported.add(fingerprint);
    if (reported.size > 50) reported.delete(reported.values().next().value ?? "");

    void fetch("/api/error-logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: reportKind,
        message: error.message,
        name: error.name,
        path: location.pathname,
        browser: navigator.userAgent,
      }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    // Monitoring must never break page startup or user interactions.
  }
}

window.addEventListener("error", (event) => submitClientError("error", event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) =>
  submitClientError("unhandled-rejection", event.reason),
);

const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  originalConsoleError(...args);
  try {
    const message = args
      .map((value) => (value instanceof Error ? value.message : String(value ?? "")))
      .join(" ");
    if (isHydrationErrorMessage(message)) {
      submitClientError("hydration", new Error(message));
    }
  } catch {
    // Keep the original console behavior even if monitoring cannot inspect the message.
  }
};
