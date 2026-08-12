export function adjacentReviewProofId(ids: string[], currentId: string, direction: "previous" | "next") {
  const currentIndex = ids.indexOf(currentId);
  if (currentIndex < 0) return null;
  return ids[currentIndex + (direction === "next" ? 1 : -1)] ?? null;
}

export function reviewProofReviewerLabel(reviewerName: string | null | undefined, maskedPhone: string) {
  const name = reviewerName?.trim();
  return name ? `${name} · ${maskedPhone}` : maskedPhone;
}

export function reviewProofDecisionBody(action: "approve" | "reject", note: string) {
  return action === "reject"
    ? { action, reasonCode: "CUSTOM", customReason: note }
    : { action, note };
}
