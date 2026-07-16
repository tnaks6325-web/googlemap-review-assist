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

export type GoogleSheetsApiStage = "token" | "sheet";

export class GoogleSheetsApiError extends Error {
  code = "SHEETS_API_FAILED";

  constructor(
    message: string,
    readonly status: number,
    readonly stage: GoogleSheetsApiStage
  ) {
    super(message);
  }
}

export function googleSheetsFailureMessage(error: GoogleSheetsApiError) {
  if (error.stage === "token") {
    return "Google 서비스 계정 인증에 실패했어요. GOOGLE_SHEETS_CLIENT_EMAIL과 GOOGLE_SHEETS_PRIVATE_KEY를 확인해 주세요.";
  }

  if (error.status === 403) {
    return "Google Sheets API를 활성화하고 광고 요청 시트를 서비스 계정 이메일에 뷰어 권한으로 공유해 주세요.";
  }

  if (error.status === 404) {
    return "스프레드시트 ID 또는 시트 탭과 범위를 확인해 주세요.";
  }

  if (error.status === 400) {
    return "GOOGLE_SHEETS_RANGE의 시트 탭 이름과 범위를 확인해 주세요. 기본값은 '광고요청시트'!A:U입니다.";
  }

  if (error.status === 429) {
    return "Google Sheets API 할당량을 초과했어요. 잠시 후 다시 시도해 주세요.";
  }

  return "Google Sheet를 읽지 못했어요. 서비스 계정과 시트 설정을 확인해 주세요.";
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
    throw new GoogleSheetsApiError(data.error ?? "token request failed", res.status, "token");
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
    throw new GoogleSheetsApiError(data.error?.status ?? "sheet read failed", res.status, "sheet");
  }
  return {
    range: data.range ?? range,
    values: Array.isArray(data.values) ? data.values : [],
  };
}
