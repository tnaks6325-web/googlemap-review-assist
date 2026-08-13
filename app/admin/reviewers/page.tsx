import { redirect } from "next/navigation";

/** Legacy reviewer-settlement entry point. Review proof and Hana payout flows now have dedicated screens. */
export default function AdminReviewersPage() {
  redirect("/admin/review-proofs");
}
