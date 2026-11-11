import { GRADE_STYLE, type Grade } from "@/shared/lib";

export function GradeBadge({ grade, size = "sm" }: { grade: Grade | null; size?: "sm" | "lg" }) {
  if (!grade) return <span className="text-xs text-neutral-400">데이터 없음</span>;
  const pad = size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-medium ring-1 ring-inset ${pad} ${GRADE_STYLE[grade].badge}`}>
      {grade}
    </span>
  );
}
