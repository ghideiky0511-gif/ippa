import type { ReactNode } from 'react';
import { SearchX } from 'lucide-react';

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <section className="flex min-h-56 flex-col items-center justify-center rounded-brand border border-dashed border-border bg-surface px-6 py-10 text-center">
      <div className="mb-3 text-brand-primary">{icon ?? <SearchX className="size-7" aria-hidden="true" />}</div>
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </section>
  );
}
