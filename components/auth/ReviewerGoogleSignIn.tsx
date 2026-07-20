"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export function ReviewerGoogleSignIn() {
  const router = useRouter();
  const refreshAccount = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <GoogleSignInButton
      className="w-full"
      label="Google 계정으로 로그인"
      onSuccess={refreshAccount}
    />
  );
}
