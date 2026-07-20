import { createPublicKey, createVerify } from "crypto";
import type { JsonWebKey as CryptoJsonWebKey } from "crypto";
import { prisma } from "@/lib/db";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const MAX_CREDENTIAL_LENGTH = 8192;
const MAX_ACCESS_TOKEN_LENGTH = 4096;

let cachedJwks: { expiresAt: number; value: GoogleJwks } | null = null;

interface GoogleJwk extends CryptoJsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

interface GoogleJwks {
  keys?: GoogleJwk[];
}

interface GoogleIdPayload {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
}

interface GoogleAccessTokenInfo {
  aud?: unknown;
  issued_to?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}

interface GoogleUserInfo {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
}

type FetchGoogle = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface GoogleIdentityProfile {
  googleSub: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export class GoogleAuthError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function decodeBase64UrlJson<T>(segment: string): T {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    throw new GoogleAuthError("GOOGLE_TOKEN_INVALID", "Google 로그인 토큰을 확인할 수 없습니다", 401);
  }
}

function safeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function splitJwt(token: string) {
  if (!token || token.length > MAX_CREDENTIAL_LENGTH) {
    throw new GoogleAuthError("GOOGLE_TOKEN_INVALID", "Google 로그인 토큰을 확인할 수 없습니다", 401);
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new GoogleAuthError("GOOGLE_TOKEN_INVALID", "Google 로그인 토큰을 확인할 수 없습니다", 401);
  }
  return parts as [string, string, string];
}

async function fetchGoogleJwks(): Promise<GoogleJwks> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.expiresAt > now) return cachedJwks.value;

  const res = await fetch(GOOGLE_JWKS_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new GoogleAuthError("GOOGLE_JWKS_FAILED", "Google 인증키를 가져오지 못했습니다", 502);
  }
  const data = (await res.json()) as GoogleJwks;
  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1];
  cachedJwks = {
    expiresAt: now + Math.max(Number(maxAge ?? 300), 60) * 1000,
    value: data,
  };
  return data;
}

export async function verifyGoogleIdTokenWithJwks(
  credential: string,
  clientId: string,
  jwks: GoogleJwks,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<GoogleIdentityProfile> {
  const [headerSegment, payloadSegment, signatureSegment] = splitJwt(credential);
  const header = decodeBase64UrlJson<{ alg?: unknown; kid?: unknown }>(headerSegment);
  const payload = decodeBase64UrlJson<GoogleIdPayload>(payloadSegment);

  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new GoogleAuthError("GOOGLE_TOKEN_INVALID", "Google 로그인 토큰을 확인할 수 없습니다", 401);
  }

  const jwk = jwks.keys?.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new GoogleAuthError("GOOGLE_KEY_NOT_FOUND", "Google 인증키를 찾을 수 없습니다", 401);
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerSegment}.${payloadSegment}`);
  verifier.end();
  const validSignature = verifier.verify(
    createPublicKey({ key: jwk as CryptoJsonWebKey, format: "jwk" }),
    Buffer.from(signatureSegment, "base64url"),
  );
  if (!validSignature) {
    throw new GoogleAuthError("GOOGLE_SIGNATURE_INVALID", "Google 로그인 토큰 서명이 올바르지 않습니다", 401);
  }

  if (typeof payload.iss !== "string" || !GOOGLE_ISSUERS.has(payload.iss)) {
    throw new GoogleAuthError("GOOGLE_ISSUER_INVALID", "Google 로그인 발급자를 확인할 수 없습니다", 401);
  }
  if (payload.aud !== clientId) {
    throw new GoogleAuthError("GOOGLE_AUDIENCE_MISMATCH", "Google 로그인 클라이언트가 일치하지 않습니다", 401);
  }
  if (typeof payload.exp !== "number" || payload.exp < nowSeconds - 60) {
    throw new GoogleAuthError("GOOGLE_TOKEN_EXPIRED", "Google 로그인 토큰이 만료됐습니다", 401);
  }
  const googleSub = safeString(payload.sub, 128);
  if (!googleSub) {
    throw new GoogleAuthError("GOOGLE_SUB_MISSING", "Google 계정 식별자를 확인할 수 없습니다", 401);
  }
  if (payload.email && payload.email_verified !== true) {
    throw new GoogleAuthError("GOOGLE_EMAIL_UNVERIFIED", "Google 이메일 인증이 필요합니다", 401);
  }

  return {
    googleSub,
    email: safeString(payload.email, 255),
    name: safeString(payload.name, 120),
    avatarUrl: safeString(payload.picture, 500),
  };
}

export async function verifyGoogleIdToken(credential: string): Promise<GoogleIdentityProfile> {
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new GoogleAuthError("GOOGLE_AUTH_NOT_CONFIGURED", "Google 로그인 설정이 필요합니다", 500);
  }
  return verifyGoogleIdTokenWithJwks(credential, clientId, await fetchGoogleJwks());
}

export async function verifyGoogleAccessTokenWithFetch(
  accessToken: string,
  clientId: string,
  fetchGoogle: FetchGoogle = fetch,
): Promise<GoogleIdentityProfile> {
  if (!accessToken || accessToken.length > MAX_ACCESS_TOKEN_LENGTH) {
    throw new GoogleAuthError(
      "GOOGLE_TOKEN_INVALID",
      "Google 로그인 토큰을 확인할 수 없습니다.",
      401,
    );
  }

  const tokenInfoResponse = await fetchGoogle(GOOGLE_TOKENINFO_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: accessToken }),
    cache: "no-store",
  });
  if (!tokenInfoResponse.ok) {
    throw new GoogleAuthError(
      "GOOGLE_TOKEN_INVALID",
      "Google 로그인 토큰이 유효하지 않거나 만료되었습니다.",
      401,
    );
  }

  const tokenInfo = (await tokenInfoResponse.json().catch(() => {
    throw new GoogleAuthError(
      "GOOGLE_TOKEN_INVALID",
      "Google 로그인 토큰 응답을 확인할 수 없습니다.",
      502,
    );
  })) as GoogleAccessTokenInfo;
  const audience = safeString(tokenInfo.aud ?? tokenInfo.issued_to, 255);
  if (audience !== clientId) {
    throw new GoogleAuthError(
      "GOOGLE_AUDIENCE_MISMATCH",
      "Google 로그인 클라이언트가 일치하지 않습니다.",
      401,
    );
  }

  const expiresIn = Number(tokenInfo.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new GoogleAuthError("GOOGLE_TOKEN_EXPIRED", "Google 로그인 토큰이 만료되었습니다.", 401);
  }

  const scopes = new Set(
    (safeString(tokenInfo.scope, 2000) ?? "").split(/\s+/).filter(Boolean),
  );
  const hasEmailScope =
    scopes.has("email") ||
    scopes.has("https://www.googleapis.com/auth/userinfo.email");
  if (!scopes.has("openid") || !hasEmailScope) {
    throw new GoogleAuthError(
      "GOOGLE_SCOPE_INVALID",
      "Google 계정 정보 확인 권한이 필요합니다.",
      401,
    );
  }

  const userInfoResponse = await fetchGoogle(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!userInfoResponse.ok) {
    throw new GoogleAuthError(
      "GOOGLE_PROFILE_FAILED",
      "Google 계정 정보를 가져오지 못했습니다.",
      502,
    );
  }

  const userInfo = (await userInfoResponse.json().catch(() => {
    throw new GoogleAuthError(
      "GOOGLE_PROFILE_FAILED",
      "Google 계정 정보 응답을 확인할 수 없습니다.",
      502,
    );
  })) as GoogleUserInfo;
  const googleSub = safeString(userInfo.sub, 128);
  if (!googleSub) {
    throw new GoogleAuthError(
      "GOOGLE_SUB_MISSING",
      "Google 계정 식별자를 확인할 수 없습니다.",
      401,
    );
  }
  if (userInfo.email && userInfo.email_verified !== true) {
    throw new GoogleAuthError(
      "GOOGLE_EMAIL_UNVERIFIED",
      "Google 이메일 인증이 필요합니다.",
      401,
    );
  }

  return {
    googleSub,
    email: safeString(userInfo.email, 255),
    name: safeString(userInfo.name, 120),
    avatarUrl: safeString(userInfo.picture, 500),
  };
}

export async function verifyGoogleAccessToken(
  accessToken: string,
): Promise<GoogleIdentityProfile> {
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new GoogleAuthError(
      "GOOGLE_AUTH_NOT_CONFIGURED",
      "Google 로그인 설정이 필요합니다.",
      500,
    );
  }
  return verifyGoogleAccessTokenWithFetch(accessToken, clientId);
}

export async function authenticateGoogleReviewer(
  profile: GoogleIdentityProfile,
  currentReviewerId?: string | null,
  options: { mode?: "login" | "switch" } = {},
) {
  const existingByGoogle = await prisma.reviewer.findUnique({
    where: { googleSub: profile.googleSub },
  });
  const reviewerToLink = options.mode === "switch" ? null : currentReviewerId;

  if (reviewerToLink) {
    if (existingByGoogle && existingByGoogle.id !== reviewerToLink) {
      throw new GoogleAuthError("GOOGLE_ALREADY_LINKED", "이미 다른 리뷰어 계정에 연결된 Google 계정입니다", 409);
    }
    const reviewer = await prisma.reviewer.update({
      where: { id: reviewerToLink },
      data: {
        googleSub: profile.googleSub,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    });
    return { reviewer, created: false, linked: true, switched: false };
  }

  if (existingByGoogle) {
    const reviewer = await prisma.reviewer.update({
      where: { id: existingByGoogle.id },
      data: {
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    });
    return {
      reviewer,
      created: false,
      linked: false,
      switched: options.mode === "switch",
    };
  }

  const reviewer = await prisma.reviewer.create({
    data: {
      phone: null,
      googleSub: profile.googleSub,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      wallet: { create: {} },
    },
  });
  return {
    reviewer,
    created: true,
    linked: false,
    switched: options.mode === "switch",
  };
}
