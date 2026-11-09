import type { ReactNode } from "react";

export function Panel({ title, action, children, className = "" }: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`animate-fade-up rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${className}`}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-300">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function StatusText({ loading, error }: { loading?: boolean; error?: string }) {
  if (error) return <p className="text-sm text-red-400">⚠ {error}</p>;
  if (loading) return <p className="animate-pulse text-sm text-neutral-500">불러오는 중…</p>;
  return null;
}
