"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

interface ReviewerGoogleSignInProps {
  mode?: "login" | "switch";
  onSuccess?: () => void;
}

export function ReviewerGoogleSignIn({
  mode = "login",
  onSuccess,
}: ReviewerGoogleSignInProps = {}) {
  const router = useRouter();
  const refreshAccount = useCallback(() => {
    onSuccess?.();
    router.refresh();
  }, [onSuccess, router]);

  return (
    <GoogleSignInButton
      className="w-full"
      label={mode === "switch" ? "전환할 Google 계정 선택" : "Google 계정으로 로그인"}
      mode={mode}
      onSuccess={refreshAccount}
    />
  );
}
