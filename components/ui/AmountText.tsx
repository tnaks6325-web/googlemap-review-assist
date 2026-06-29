import { cn } from "@/lib/cn";

interface AmountTextProps {
  value: number;
  unit?: string;
  /** 양수에 + 부호 표시 (적립 표시용) */
  sign?: boolean;
  className?: string;
}

/** 적립액·잔액 등 핵심 숫자를 크게 강조 */
export function AmountText({ value, unit = "P", sign = false, className }: AmountTextProps) {
  const prefix = sign && value > 0 ? "+" : "";
  return (
    <span className={cn("font-bold tabular-nums tracking-tight text-ink", className)}>
      {prefix}
      {value.toLocaleString("ko-KR")}
      <span className="ml-0.5 align-baseline text-[0.6em] font-semibold">{unit}</span>
    </span>
  );
}
