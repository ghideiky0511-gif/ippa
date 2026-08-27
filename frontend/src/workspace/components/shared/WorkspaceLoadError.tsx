import { AlertCircle } from 'lucide-react';

export function WorkspaceLoadError({ message, showBackendHint = false }: { message: string; showBackendHint?: boolean }) {
  return (
    <main className="min-h-[calc(100dvh-5rem)] bg-brand-background p-4 sm:p-6">
      <section className="mx-auto flex min-h-64 max-w-xl flex-col items-center justify-center rounded-brand border border-border bg-surface px-6 py-10 text-center shadow-card">
        <span className="flex size-11 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertCircle className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-extrabold text-foreground">Não foi possível abrir esta página</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        {showBackendHint && <p className="mt-3 text-xs leading-5 text-muted-foreground">Confira se o serviço <code className="rounded bg-brand-background px-1 py-0.5 text-foreground">backend</code> está rodando em localhost:3011.</p>}
      </section>
    </main>
  );
}
