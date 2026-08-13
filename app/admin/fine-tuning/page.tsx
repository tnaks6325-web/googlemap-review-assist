import { redirect } from "next/navigation";
import { getAdminId } from "@/lib/auth/session";

export const runtime = "nodejs";

export default async function AdminFineTuningPage({ searchParams }: { searchParams: Promise<{ personaId?: string }> }) {
  if (!(await getAdminId())) redirect("/admin/login");
  const personaId = (await searchParams).personaId?.trim();
  if (personaId) redirect(`/admin/review-styles?advancedPersonaId=${encodeURIComponent(personaId)}`);
  redirect("/admin/review-styles");
}
