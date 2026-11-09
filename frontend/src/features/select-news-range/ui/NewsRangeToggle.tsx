"use client";

import type { NewsRange } from "@/entities/news";
import { SegmentedControl } from "@/shared/ui";

const OPTIONS: { value: NewsRange; label: string }[] = [
  { value: "24h", label: "24시간" },
  { value: "7d", label: "7일" },
];

/** disabled: 고를 수 없는 기간 (예: 걸러낸 뒤 기사가 없는 24시간) */
export function NewsRangeToggle({ value, onChange, disabled = [] }: {
  value: NewsRange;
  onChange: (v: NewsRange) => void;
  disabled?: NewsRange[];
}) {
  const options = OPTIONS.map((o) => ({ ...o, disabled: disabled.includes(o.value) }));
  return <SegmentedControl label="뉴스 기간" value={value} options={options} onChange={onChange} />;
}
