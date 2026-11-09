"use client";

import type { NewsRange } from "@/entities/news";
import { SegmentedControl } from "@/shared/ui";

const OPTIONS: { value: NewsRange; label: string }[] = [
  { value: "24h", label: "24시간" },
  { value: "7d", label: "7일" },
];

export function NewsRangeToggle({ value, onChange }: { value: NewsRange; onChange: (v: NewsRange) => void }) {
  return <SegmentedControl label="뉴스 기간" value={value} options={OPTIONS} onChange={onChange} />;
}
