import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminReviewerCooldownReset } from "@/components/admin/AdminReviewerCooldownReset";
import { getAdminId } from "@/lib/auth/session";

export const runtime = "nodejs";

export default async function AdminReviewerCooldownResetPage() {
  const adminId = await getAdminId();
  if (!adminId) redirect("/admin/login");

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <Link href="/admin/reviewers" className="text-sm text-ink-weak hover:text-ink-sub">
        리뷰어 관리로 돌아가기
      </Link>
      <div className="mt-5">
        <AdminReviewerCooldownReset />
      </div>
    </main>
  );
}
