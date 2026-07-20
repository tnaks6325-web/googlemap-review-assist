import { createSign, generateKeyPairSync } from "crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  authenticateGoogleReviewer,
  verifyGoogleAccessTokenWithFetch,
  verifyGoogleIdTokenWithJwks,
} from "@/lib/domain/google-auth";

const CLIENT_ID = "test-client.apps.googleusercontent.com";

function base64urlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signedGoogleToken(input: {
  sub?: string;
  aud?: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  const header = base64urlJson({ alg: "RS256", typ: "JWT", kid: "kid-1" });
  const payload = base64urlJson({
    iss: "https://accounts.google.com",
    aud: input.aud ?? CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000) - 10,
    sub: input.sub ?? "google-sub-1",
    email: input.email ?? "reviewer@example.com",
    email_verified: input.emailVerified ?? true,
    name: input.name ?? "리뷰어",
    picture: input.picture ?? "https://example.com/avatar.png",
  });
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey).toString("base64url");
  return {
    token: `${signingInput}.${signature}`,
    jwks: { keys: [{ ...jwk, kid: "kid-1", alg: "RS256", use: "sig" }] },
  };
}

describe("Google reviewer auth", () => {
  it("verifies a Google access token before accepting its user profile", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const fetchGoogle = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      requests.push({ url, authorization: headers.get("authorization") });

      if (url.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
        return Response.json({
          aud: CLIENT_ID,
          expires_in: "3599",
          scope: "openid email profile",
        });
      }

      return Response.json({
        sub: "google-sub-access-token",
        email: "chooser@example.com",
        email_verified: true,
        name: "계정 선택 사용자",
        picture: "https://example.com/chooser.png",
      });
    };

    const profile = await verifyGoogleAccessTokenWithFetch(
      "access-token",
      CLIENT_ID,
      fetchGoogle,
    );

    expect(profile).toEqual({
      googleSub: "google-sub-access-token",
      email: "chooser@example.com",
      name: "계정 선택 사용자",
      avatarUrl: "https://example.com/chooser.png",
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      url: "https://openidconnect.googleapis.com/v1/userinfo",
      authorization: "Bearer access-token",
    });
  });

  it("rejects an access token issued to another OAuth client", async () => {
    const fetchGoogle = async () =>
      Response.json({
        aud: "other-client.apps.googleusercontent.com",
        expires_in: "3599",
        scope: "openid email profile",
      });

    await expect(
      verifyGoogleAccessTokenWithFetch("access-token", CLIENT_ID, fetchGoogle),
    ).rejects.toMatchObject({
      code: "GOOGLE_AUDIENCE_MISMATCH",
    });
  });

  it("verifies a Google ID token and extracts a safe profile", async () => {
    const { token, jwks } = signedGoogleToken({ sub: "google-sub-ok" });

    const profile = await verifyGoogleIdTokenWithJwks(token, CLIENT_ID, jwks);

    expect(profile).toMatchObject({
      googleSub: "google-sub-ok",
      email: "reviewer@example.com",
      name: "리뷰어",
      avatarUrl: "https://example.com/avatar.png",
    });
  });

  it("rejects a token for another client id", async () => {
    const { token, jwks } = signedGoogleToken({ aud: "other-client.apps.googleusercontent.com" });

    await expect(verifyGoogleIdTokenWithJwks(token, CLIENT_ID, jwks)).rejects.toMatchObject({
      code: "GOOGLE_AUDIENCE_MISMATCH",
    });
  });

  it("creates a Google-only reviewer and can link Google to an existing phone reviewer", async () => {
    const created = await authenticateGoogleReviewer({
      googleSub: "google-sub-create",
      email: "new@example.com",
      name: "신규 리뷰어",
      avatarUrl: null,
    });

    expect(created.reviewer.phone).toBeNull();
    expect(created.reviewer.googleSub).toBe("google-sub-create");
    expect(created.created).toBe(true);

    const phoneReviewer = await prisma.reviewer.create({
      data: { phone: "01077778888", wallet: { create: {} } },
    });
    const linked = await authenticateGoogleReviewer(
      {
        googleSub: "google-sub-link",
        email: "linked@example.com",
        name: "연결 리뷰어",
        avatarUrl: "https://example.com/linked.png",
      },
      phoneReviewer.id,
    );

    expect(linked.reviewer.id).toBe(phoneReviewer.id);
    expect(linked.reviewer.googleSub).toBe("google-sub-link");
    expect(linked.linked).toBe(true);
  });

  it("switches to another Google reviewer without overwriting either saved account", async () => {
    const current = await prisma.reviewer.create({
      data: {
        googleSub: "google-sub-current",
        email: "current@example.com",
        name: "현재 계정",
        wallet: { create: {} },
      },
    });
    const target = await prisma.reviewer.create({
      data: {
        googleSub: "google-sub-target",
        email: "target@example.com",
        name: "전환 계정",
        wallet: { create: {} },
      },
    });

    const switched = await authenticateGoogleReviewer(
      {
        googleSub: "google-sub-target",
        email: "target-updated@example.com",
        name: "전환 계정",
        avatarUrl: null,
      },
      current.id,
      { mode: "switch" },
    );

    expect(switched.reviewer.id).toBe(target.id);
    await expect(
      prisma.reviewer.findUniqueOrThrow({ where: { id: current.id } }),
    ).resolves.toMatchObject({
      googleSub: "google-sub-current",
      email: "current@example.com",
    });
    await expect(
      prisma.reviewer.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({
      googleSub: "google-sub-target",
      email: "target-updated@example.com",
    });
  });
});
