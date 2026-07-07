"use client";

import { useEffect, useState } from "react";

/** 숫자 카운트업(reduced-motion 선호 시 즉시 표시) */
export function CountUp({
  value,
  durationMs = 800,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value <= 0) {
      const raf = requestAnimationFrame(() => setN(value));
      return () => cancelAnimationFrame(raf);
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <span className={className}>{n.toLocaleString("ko-KR")}</span>;
}
