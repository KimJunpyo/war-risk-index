"use client";

export function SegmentedControl<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-white/5 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 transition ${
            o.value === value ? "bg-white/15 text-white" : "text-neutral-400 enabled:hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
