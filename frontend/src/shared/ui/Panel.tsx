import type { ReactNode } from "react";

export function Panel({ title, action, children, className = "" }: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`animate-fade-up rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${className}`}>
      {/* 좁은 폭(md 미만)에서는 action 을 제목 아래 줄로 */}
      <header className="mb-4 flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-300">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function StatusText({ loading, error }: { loading?: boolean; error?: string }) {
  if (error) return <p className="text-sm text-red-400">⚠ {error}</p>;
  if (loading) return <p className="animate-pulse text-sm text-neutral-400">불러오는 중…</p>;
  return null;
}
