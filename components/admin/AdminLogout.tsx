"use client";

import { useRouter } from "next/navigation";

export function AdminLogout() {
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  };
  return (
    <button onClick={logout} className="text-sm text-ink-weak hover:text-ink-sub">
      로그아웃
    </button>
  );
}
