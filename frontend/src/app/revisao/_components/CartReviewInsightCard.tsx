'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CartReviewInsightSummarySchema,
  type CartReviewInsightSummary,
} from '@/contracts/ai';
import { apiFetch } from '@/lib/api-client';
import type { CartItem } from '@/domain/orders/types';
import {
  AiResponseCard,
  AiResponseInsights,
  AiResponseText,
  type AiResponseState,
} from '@/components/ui/ai-response';

interface CartReviewInsightCardProps {
  items: CartItem[];
}

function CartReviewInsightCardSession({ items }: CartReviewInsightCardProps) {
  const [state, setState] = useState<AiResponseState>('idle');
  const [result, setResult] = useState<CartReviewInsightSummary | null>(null);
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
      const response = await apiFetch('/api/cart-review/insight', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String(payload.error)
          : 'Não foi possível gerar a sugestão agora.';
        throw new Error(message);
      }
      const parsed = CartReviewInsightSummarySchema.safeParse(payload);
      if (!parsed.success) throw new Error('A resposta da sugestão veio em um formato inesperado.');
      if (activeRequest.current !== controller) return;
      setResult(parsed.data);
      setState(parsed.data.status === 'empty_cart' ? 'empty' : 'success');
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Não foi possível gerar a sugestão agora.');
      setState('error');
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, [items]);

  const available = result?.status === 'available' ? result : null;

  return (
    <AiResponseCard
      title="Sugestões para o pedido"
      description="Leitura do mix do carrinho e sugestões de categoria para completar o pedido."
      state={state}
      onAction={generate}
      actionLabel="Gerar sugestão"
      emptyMessage="Adicione peças ao carrinho para gerar uma sugestão."
      errorMessage={error ?? undefined}
      source={available?.source}
    >
      {available && (
        <div className="space-y-2.5">
          <AiResponseText>{available.analysis.text}</AiResponseText>
          <AiResponseInsights items={available.analysis.suggestions.map((suggestion) => ({
            title: suggestion.title,
            evidence: suggestion.evidence,
            action: suggestion.action,
          }))} />
        </div>
      )}
    </AiResponseCard>
  );
}

// A chave interna garante que uma mudança no conteúdo do carrinho descarte
// resultado, erro e request pendente — não há um id de sessão estável aqui
// como no card de última compra.
export default function CartReviewInsightCard({ items }: CartReviewInsightCardProps) {
  const key = items.map((item) => `${item.key}:${item.qty}`).join('|');
  return <CartReviewInsightCardSession key={key} items={items} />;
}
