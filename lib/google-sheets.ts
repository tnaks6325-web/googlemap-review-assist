import { createSign } from "crypto";
import { readFile } from "fs/promises";

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface ValuesResponse {
  range?: string;
  values?: unknown[][];
  error?: { status?: string; message?: string };
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const FETCH_TIMEOUT_MS = 10000;

export class GoogleSheetsConfigError extends Error {
  code = "SHEETS_CONFIG_MISSING";
}

export class GoogleSheetsApiError extends Error {
  code = "SHEETS_API_FAILED";

  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function parsePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

async function loadServiceAccount(): Promise<ServiceAccountCredentials> {
  const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH?.trim();
  if (credentialsPath) {
    const json = JSON.parse(await readFile(credentialsPath, "utf8")) as Partial<ServiceAccountCredentials>;
    if (typeof json.client_email === "string" && typeof json.private_key === "string") {
      return { client_email: json.client_email, private_key: json.private_key };
    }
  }

  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    return { client_email: clientEmail, private_key: parsePrivateKey(privateKey) };
  }

  throw new GoogleSheetsConfigError("Google Sheets credentials are not configured");
}

async function createAccessToken() {
  const credentials = await loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64url(
      JSON.stringify({
        iss: credentials.client_email,
        scope: SHEETS_SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      })
    ),
  ].join(".");
  const signature = createSign("RSA-SHA256").update(unsigned).sign(credentials.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new GoogleSheetsApiError(data.error ?? "token request failed", res.status);
  }
  return data.access_token;
}

export async function readGoogleSheetValues(spreadsheetId: string, range: string) {
  if (!spreadsheetId.trim()) throw new GoogleSheetsConfigError("Google Sheets spreadsheet id is not configured");
  if (!range.trim()) throw new GoogleSheetsConfigError("Google Sheets range is not configured");

  const accessToken = await createAccessToken();
  const encodedRange = encodeURIComponent(range);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodedRange}`,
    {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { authorization: `Bearer ${accessToken}` },
    }
  );
  const data = (await res.json().catch(() => ({}))) as ValuesResponse;
  if (!res.ok) {
    throw new GoogleSheetsApiError(data.error?.status ?? "sheet read failed", res.status);
  }
  return {
    range: data.range ?? range,
    values: Array.isArray(data.values) ? data.values : [],
  };
}
