import { cn } from "@/lib/cn";

interface StepBarProps {
  current: number;
  total: number;
  className?: string;
}

/** 진행감 인디케이터 — "곧 끝남"을 체감시켜 이탈 방지 */
export function StepBar({ current, total, className }: StepBarProps) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-brand transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium tabular-nums text-ink-weak">
        {current}/{total}
      </span>
    </div>
  );
}
