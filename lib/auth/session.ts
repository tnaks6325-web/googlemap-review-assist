import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

// R1: 하드코딩 폴백 제거. 운영에서 시크릿이 없거나 약하면 부팅을 막는다.
const RAW_SECRET = process.env.SESSION_SECRET;
if ((!RAW_SECRET || RAW_SECRET.length < 32) && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET 환경변수(32자 이상)가 운영 환경에 반드시 설정되어야 합니다.");
}
const SECRET = RAW_SECRET ?? "dev-insecure-secret-not-for-production-use-only";

export const REVIEWER_COOKIE = "rv_session";
export const OWNER_COOKIE = "ow_session";

type Role = "r" | "o";

function signToken(role: Role, id: string): string {
  const value = `${role}:${id}`;
  const sig = createHmac("sha256", SECRET).update(value).digest("base64url");
  return `${value}.${sig}`;
}

function verifyToken(role: Role, token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const value = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = createHmac("sha256", SECRET).update(value).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  // 역할 네임스페이스 검증 (reviewer 토큰을 owner로 재사용 불가)
  const sep = value.indexOf(":");
  if (sep < 0) return null;
  if (value.slice(0, sep) !== role) return null;
  const id = value.slice(sep + 1);
  return id || null;
}

export const signReviewerSession = (id: string) => signToken("r", id);
export const signOwnerSession = (id: string) => signToken("o", id);

export async function getReviewerId(): Promise<string | null> {
  const store = await cookies();
  return verifyToken("r", store.get(REVIEWER_COOKIE)?.value);
}

export async function getOwnerId(): Promise<string | null> {
  const store = await cookies();
  return verifyToken("o", store.get(OWNER_COOKIE)?.value);
}

const baseCookie = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export const sessionCookieOptions = { ...baseCookie, maxAge: 60 * 60 * 24 * 30 }; // 고객 30일
export const ownerCookieOptions = { ...baseCookie, maxAge: 60 * 60 * 12 }; // 사장님 12시간
