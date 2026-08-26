'use client';

import type { ReactNode } from 'react';
import { AlertCircle, Database, RefreshCw, Sparkles } from 'lucide-react';
import { Badge } from './badge';
import { Button } from './button';
import { Card } from './card';
import { Skeleton } from './skeleton';
import { cn } from '@/lib/cn';

export type AiResponseState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface AiResponseInsightItem {
  title: string;
  evidence: string;
  action: string;
  isInterpretation?: boolean;
}

export interface AiResponseKpiItem {
  label: string;
  value: string;
}

export interface AiResponseCardProps {
  title: string;
  description: string;
  state: AiResponseState;
  actionLabel?: string;
  onAction?: () => void;
  emptyMessage?: string;
  errorMessage?: string;
  source?: 'provider' | 'cache';
  children?: ReactNode;
  className?: string;
}

export function AiResponseCard({
  title,
  description,
  state,
  actionLabel = 'Gerar análise',
  onAction,
  emptyMessage = 'Não há dados suficientes para esta análise.',
  errorMessage = 'Não foi possível gerar a análise agora.',
  source,
  children,
  className,
}: AiResponseCardProps) {
  const isBusy = state === 'loading';
  return (
    <Card
      className={cn('overflow-hidden border-brand-primary/20 shadow-none', className)}
      aria-busy={isBusy}
    >
      <div className="flex items-start gap-3 border-b border-border bg-brand-background/70 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
            {state === 'success' && source && (
              <Badge className="gap-1 bg-surface text-muted-foreground">
                {source === 'cache' && <Database className="size-3" aria-hidden="true" />}
                {source === 'cache' ? 'resultado recente' : 'gerado agora'}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="p-3" aria-live="polite">
        {state === 'idle' && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              A análise usa somente a última compra paga e não altera o pedido atual.
            </p>
            {onAction && <Button type="button" size="sm" onClick={onAction}>{actionLabel}</Button>}
          </div>
        )}

        {state === 'loading' && (
          <div className="space-y-3" role="status">
            <span className="sr-only">Gerando análise</span>
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        )}

        {state === 'empty' && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-xs leading-relaxed text-muted-foreground">{emptyMessage}</p>
            {onAction && (
              <Button type="button" size="sm" variant="ghost" onClick={onAction}>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Verificar novamente
              </Button>
            )}
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-start gap-3">
            <p className="flex gap-2 text-xs leading-relaxed text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errorMessage}
            </p>
            {onAction && (
              <Button type="button" size="sm" variant="outline" onClick={onAction}>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Tentar novamente
              </Button>
            )}
          </div>
        )}

        {state === 'success' && children}
      </div>
    </Card>
  );
}

export function AiResponseInsights({ items }: { items: AiResponseInsightItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <article key={`${item.title}-${index}`} className="rounded-control border border-border bg-surface p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="text-xs font-extrabold text-foreground">{item.title}</h4>
            {item.isInterpretation && <Badge>interpretação</Badge>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.evidence}</p>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-foreground">
            Próximo passo: {item.action}
          </p>
        </article>
      ))}
    </div>
  );
}

export function AiResponseKpis({ items }: { items: AiResponseKpiItem[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="rounded-control bg-brand-background px-2.5 py-2">
          <dt className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="mt-0.5 truncate text-sm font-extrabold text-foreground" title={item.value}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AiResponseText({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-control border border-brand-primary/15 bg-brand-primary/5 p-3">
      <p className="text-sm font-semibold leading-relaxed text-foreground">{children}</p>
    </div>
  );
}
