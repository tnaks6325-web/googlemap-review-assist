/** 가벼운 className 결합 유틸 (falsy 제거 후 공백 join) */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}
