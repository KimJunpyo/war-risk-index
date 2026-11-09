"use client";

import type { ChartPeriod } from "@/entities/risk-index";
import { SegmentedControl } from "@/shared/ui";

const OPTIONS: { value: ChartPeriod; label: string }[] = [
  { value: "1y", label: "1년" },
  { value: "3y", label: "3년" },
  { value: "all", label: "전체" },
];

export function PeriodToggle({ value, onChange }: { value: ChartPeriod; onChange: (v: ChartPeriod) => void }) {
  return <SegmentedControl label="차트 기간" value={value} options={OPTIONS} onChange={onChange} />;
}
