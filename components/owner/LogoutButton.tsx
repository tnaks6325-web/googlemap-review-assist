"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/auth/owner/logout", { method: "POST" });
    router.replace("/owner/login");
    router.refresh();
  };
  return (
    <button onClick={logout} className="text-sm text-ink-weak hover:text-ink-sub">
      로그아웃
    </button>
  );
}
