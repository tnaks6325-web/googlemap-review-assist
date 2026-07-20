import { describe, expect, it } from "vitest";
import { googleAccountChooserOptions } from "@/lib/google-account-chooser";

describe("Google account chooser", () => {
  it("always asks Google to show the account selection screen", () => {
    expect(
      googleAccountChooserOptions("test-client.apps.googleusercontent.com"),
    ).toEqual({
      client_id: "test-client.apps.googleusercontent.com",
      scope: "openid email profile",
      prompt: "select_account",
    });
  });
});
