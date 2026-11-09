"use client";

import { useEffect, useRef, useState } from "react";
import { formatScore } from "@/shared/lib";

const DURATION_MS = 700;

/** 값이 바뀌면 이전 값에서 새 값까지 숫자가 올라가는 애니메이션. 동작 줄이기 설정이면 바로 표시. */
export function AnimatedNumber({ value, className }: { value: number | null | undefined; className?: string }) {
  const [shown, setShown] = useState<number | null>(value ?? null);
  const from = useRef<number>(value ?? 0);

  useEffect(() => {
    if (value === null || value === undefined) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = reduce ? 1 : Math.min(1, (t - start) / DURATION_MS);
      const eased = 1 - (1 - p) ** 3;
      setShown(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{formatScore(value === null || value === undefined ? null : shown)}</span>;
}
