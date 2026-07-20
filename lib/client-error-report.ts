import { sanitizeErrorText } from "@/lib/error-logging";

export type ClientErrorKind = "error" | "unhandled-rejection" | "hydration";

export interface ClientErrorReport {
  kind: ClientErrorKind;
  message: string;
  name: string;
  path: string;
  browser: string;
}

const KINDS = new Set<ClientErrorKind>(["error", "unhandled-rejection", "hydration"]);

export function normalizeClientErrorReport(value: unknown): ClientErrorReport | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const kind = typeof input.kind === "string" ? input.kind : "";
  const message = typeof input.message === "string" ? sanitizeErrorText(input.message) : "";
  if (!KINDS.has(kind as ClientErrorKind) || !message.trim()) return null;

  return {
    kind: kind as ClientErrorKind,
    message: message.slice(0, 1_000),
    name: sanitizeErrorText(typeof input.name === "string" ? input.name : "Error").slice(0, 120),
    path: sanitizeErrorText(
      typeof input.path === "string" ? input.path.split("?")[0] : "/",
    ).slice(0, 300),
    browser: sanitizeErrorText(
      typeof input.browser === "string" ? input.browser : "알 수 없는 브라우저",
    ).slice(0, 300),
  };
}
