const HYDRATION_PATTERNS = [
  /hydration failed/i,
  /hydrated but some attributes/i,
  /server rendered html.*did(?:n't| not) match/i,
  /text content does not match server-rendered html/i,
];

export function isHydrationErrorMessage(message: string) {
  return HYDRATION_PATTERNS.some((pattern) => pattern.test(message));
}
