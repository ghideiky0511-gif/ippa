'use client';

import { useEffect, useRef } from 'react';

interface PollingOptions {
  baseIntervalMs: number;
  maxIntervalMs?: number;
  enabled?: boolean;
}

// Polling controlado para a aba Conversas: nunca dispara sem parar (ver
// backend/docs/mensageria/bippa-messaging/docs/chat-backend-integration.md,
// "Operação em escala" -- "faça-o somente para conversas abertas/visíveis,
// com backoff e jitter"). Pausa quando a aba fica oculta e retoma com uma
// chamada imediata ao voltar, em vez de esperar o próximo tick agendado.
// Erros entram em backoff exponencial (até `maxIntervalMs`); o primeiro
// sucesso depois de uma falha volta ao intervalo normal.
export function useConversationPolling(
  tick: () => Promise<void>,
  { baseIntervalMs, maxIntervalMs = 60_000, enabled = true }: PollingOptions,
): void {
  const tickRef = useRef(tick);

  useEffect(() => {
    tickRef.current = tick;
  });

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let failures = 0;
    let timer: number | null = null;

    function jitter(ms: number) {
      return ms * (0.85 + Math.random() * 0.3);
    }

    function schedule(delayMs: number) {
      if (stopped) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), jitter(delayMs));
    }

    async function run() {
      if (stopped) return;
      if (document.hidden) {
        // Não conta como falha -- só adia até a aba voltar a ficar visível
        // (o listener de visibilitychange abaixo cobre a retomada rápida).
        schedule(baseIntervalMs);
        return;
      }
      try {
        await tickRef.current();
        failures = 0;
        schedule(baseIntervalMs);
      } catch {
        failures += 1;
        schedule(Math.min(maxIntervalMs, baseIntervalMs * 2 ** failures));
      }
    }

    function handleVisibilityChange() {
      if (!document.hidden) void run();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    schedule(baseIntervalMs);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [baseIntervalMs, maxIntervalMs, enabled]);
}
