'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CatalogLastOrderSummarySchema,
  type CatalogLastOrderSummary,
} from '@/contracts/ai';
import { apiFetch } from '@/lib/api-client';
import { formatBRL } from '@/lib/format';
import {
  AiResponseCard,
  AiResponseKpis,
  AiResponseText,
  type AiResponseState,
} from '@/components/ui/ai-response';

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
  if (value === null) return 'sem base';
  if (value === 0) return 'na média';
  return `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function formatRecency(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days.toLocaleString('pt-BR')} dias`;
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
      description="Leitura rápida para orientar a próxima oferta."
      state={state}
      onAction={generate}
      actionLabel="Gerar resumo"
      emptyMessage="Esta cliente ainda não tem uma compra paga no histórico."
      errorMessage={error ?? undefined}
      source={available?.source}
    >
      {available && (
        <div className="space-y-2.5">
          <AiResponseKpis items={[
            { label: 'Valor', value: formatBRL(available.facts.lastOrder.totalValue) },
            { label: 'Peças', value: available.facts.lastOrder.totalPieces.toLocaleString('pt-BR') },
            { label: 'Recência', value: formatRecency(available.facts.lastOrder.daysSincePurchase) },
            { label: 'Vs. ticket loja', value: formatDifference(available.facts.tickets.tenant.differencePercent) },
          ]} />

          <AiResponseText>{available.analysis.text}</AiResponseText>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Compra em {formatOrderDate(available.facts.lastOrder.orderDate)} · ticket da cliente: {formatDifference(available.facts.tickets.client.differencePercent)} em {available.facts.tickets.client.orderCount} pedidos
          </p>
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
