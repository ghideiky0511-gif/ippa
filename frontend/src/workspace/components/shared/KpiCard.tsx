import type { ReactNode } from 'react';

export function KpiCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <article className="rounded-brand border border-border bg-surface p-4 shadow-card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </article>
  );
}
