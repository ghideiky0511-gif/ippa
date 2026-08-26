'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';
import {
  CatalogLastOrderSummarySchema,
  type CatalogLastOrderSummary,
  type CatalogOrderBreakdownItem,
} from '@/contracts/ai';
import { apiFetch } from '@/lib/api-client';
import { formatBRL } from '@/lib/format';
import { AiResponseCard, AiResponseInsights, type AiResponseState } from '@/components/ui/ai-response';

interface LastOrderAiAnalysisProps {
  sessionId: string;
}

function formatOrderDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDifference(value: number | null): string {
  if (value === null) return 'comparação indisponível';
  if (value === 0) return 'igual à média';
  return `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function compactBreakdown(items: CatalogOrderBreakdownItem[]): string {
  if (items.length === 0) return 'sem informação';
  return items.slice(0, 3).map((item) => `${item.label} ${item.quantity}`).join(' · ');
}

function LastOrderAiAnalysisSession({ sessionId }: LastOrderAiAnalysisProps) {
  const [state, setState] = useState<AiResponseState>('idle');
  const [result, setResult] = useState<CatalogLastOrderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => activeRequest.current?.abort();
  }, []);

  const generate = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setState('loading');
    setError(null);

    try {
      const response = await apiFetch(
        `/api/sessions/${encodeURIComponent(sessionId)}/last-order-summary`,
        { method: 'POST', cache: 'no-store', signal: controller.signal },
      );
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String(payload.error)
          : 'Não foi possível gerar a análise agora.';
        throw new Error(message);
      }
      const parsed = CatalogLastOrderSummarySchema.safeParse(payload);
      if (!parsed.success) throw new Error('A resposta da análise veio em um formato inesperado.');
      if (activeRequest.current !== controller) return;
      setResult(parsed.data);
      setState(parsed.data.status === 'no_history' ? 'empty' : 'success');
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Não foi possível gerar a análise agora.');
      setState('error');
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, [sessionId]);

  const available = result?.status === 'available' ? result : null;

  return (
    <AiResponseCard
      title="Resumo da última compra"
      description="Uma segunda leitura operacional para apoiar este atendimento."
      state={state}
      onAction={generate}
      emptyMessage="Esta cliente ainda não tem uma compra paga no histórico."
      errorMessage={error ?? undefined}
      source={available?.source}
    >
      {available && (
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-2">
            <div className="rounded-control bg-brand-background p-2">
              <dt className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Data</dt>
              <dd className="mt-1 text-xs font-extrabold text-foreground">
                {formatOrderDate(available.facts.lastOrder.orderDate)}
              </dd>
            </div>
            <div className="rounded-control bg-brand-background p-2">
              <dt className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Peças</dt>
              <dd className="mt-1 text-xs font-extrabold text-foreground">
                {available.facts.lastOrder.totalPieces}
              </dd>
            </div>
            <div className="rounded-control bg-brand-background p-2">
              <dt className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Valor</dt>
              <dd className="mt-1 text-xs font-extrabold text-foreground">
                {formatBRL(available.facts.lastOrder.totalValue)}
              </dd>
            </div>
          </dl>

          <div className="space-y-1 rounded-control border border-border p-2 text-xs">
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Ticket da cliente · {available.facts.tickets.client.orderCount} pedidos</span>
              <strong className="text-right text-foreground">
                {available.facts.tickets.client.averageValue === null
                  ? 'sem amostra'
                  : `${formatBRL(available.facts.tickets.client.averageValue)} · ${formatDifference(available.facts.tickets.client.differencePercent)}`}
              </strong>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Ticket da loja · {available.facts.tickets.tenant.orderCount} pedidos</span>
              <strong className="text-right text-foreground">
                {available.facts.tickets.tenant.averageValue === null
                  ? 'sem amostra'
                  : `${formatBRL(available.facts.tickets.tenant.averageValue)} · ${formatDifference(available.facts.tickets.tenant.differencePercent)}`}
              </strong>
            </p>
          </div>

          <div className="rounded-control border border-border p-2 text-xs leading-relaxed">
            <p><span className="font-bold text-foreground">Categorias:</span> <span className="text-muted-foreground">{compactBreakdown(available.facts.mix.categories)}</span></p>
            <p><span className="font-bold text-foreground">Cores:</span> <span className="text-muted-foreground">{compactBreakdown(available.facts.mix.colors)}</span></p>
            <p><span className="font-bold text-foreground">Grade:</span> <span className="text-muted-foreground">{compactBreakdown(available.facts.mix.sizes)}</span></p>
          </div>

          <div className="rounded-control bg-brand-primary/5 p-3">
            <p className="text-sm font-semibold leading-relaxed text-foreground">{available.analysis.summary}</p>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock3 className="size-3.5" aria-hidden="true" />
              Há {available.facts.lastOrder.daysSincePurchase} dias
            </p>
          </div>

          <AiResponseInsights items={available.analysis.insights} />

          {available.analysis.sampleWarning && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Atenção à amostra: {available.analysis.sampleWarning}
            </p>
          )}
        </div>
      )}
    </AiResponseCard>
  );
}

// A chave interna garante que uma troca de atendimento descarte resultado,
// erro e request pendente mesmo quando o consumidor reutiliza o componente.
export default function LastOrderAiAnalysis({ sessionId }: LastOrderAiAnalysisProps) {
  return <LastOrderAiAnalysisSession key={sessionId} sessionId={sessionId} />;
}
