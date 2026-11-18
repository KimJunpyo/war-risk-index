"use client";

/** className: 묶음에 더할 클래스(예: h-11 이면 버튼이 늘어나 높이 40px) */
export function SegmentedControl<T extends string>({ value, options, onChange, label, className = "" }: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex rounded-lg bg-track p-0.5 text-xs ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 transition ${
            o.value === value ? "bg-selected text-fg-strong" : "text-fg-muted enabled:hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
