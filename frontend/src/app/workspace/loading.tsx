function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-control bg-brand-background ${className}`} />;
}

/**
 * Mantém a navegação responsiva enquanto a rota dinâmica busca seus dados
 * no servidor. Também cria a fronteira de prefetch que o App Router usa
 * para transições internas do Workspace.
 */
export default function WorkspaceLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)] p-4 sm:p-6" aria-busy="true" aria-label="Carregando página">
      <div className="mx-auto max-w-6xl">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-32 w-full" />)}
        </div>
      </div>
    </div>
  );
}
