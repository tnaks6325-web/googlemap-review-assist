export type ReviewerEntryStep = "signIn" | "summary";

export function getInitialReviewerStep(hasReviewerSession: boolean): ReviewerEntryStep {
  return hasReviewerSession ? "summary" : "signIn";
}
