import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getReviewerHomeAccount } from "@/lib/domain/reviewer-home";

describe("reviewer home account", () => {
  it("returns only the display-safe Google account fields for the authenticated reviewer", async () => {
    const reviewer = await prisma.reviewer.create({
      data: {
        phone: `0106${String(Date.now()).slice(-7)}`,
        googleSub: `google-home-${Date.now()}`,
        email: "home-reviewer@example.com",
        name: "홈 리뷰어",
        avatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
        wallet: { create: {} },
      },
    });

    const account = await getReviewerHomeAccount(reviewer.id);

    expect(account).toEqual({
      name: "홈 리뷰어",
      email: "home-reviewer@example.com",
      avatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
    });
    expect(account).not.toHaveProperty("id");
    expect(account).not.toHaveProperty("phone");
    expect(account).not.toHaveProperty("googleSub");
  });

  it("returns null when there is no authenticated reviewer", async () => {
    await expect(getReviewerHomeAccount(null)).resolves.toBeNull();
  });

  it("does not present a phone-only reviewer as a connected Google account", async () => {
    const reviewer = await prisma.reviewer.create({
      data: {
        phone: `0105${String(Date.now()).slice(-7)}`,
        name: "전화번호 리뷰어",
        wallet: { create: {} },
      },
    });

    await expect(getReviewerHomeAccount(reviewer.id)).resolves.toBeNull();
  });

  it("does not expose an untrusted avatar URL", async () => {
    const reviewer = await prisma.reviewer.create({
      data: {
        googleSub: `google-home-untrusted-${Date.now()}`,
        email: "avatar-reviewer@example.com",
        name: "아바타 리뷰어",
        avatarUrl: "http://tracking.example.com/avatar.png",
        wallet: { create: {} },
      },
    });

    await expect(getReviewerHomeAccount(reviewer.id)).resolves.toEqual({
      name: "아바타 리뷰어",
      email: "avatar-reviewer@example.com",
      avatarUrl: null,
    });
  });
});
