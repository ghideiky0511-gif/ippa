'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { adminUi } from '@/workspace/lib/ui';
import { DisabledActionHint } from '@/components/DisabledActionHint';
import { fetchCrmServiceWindow, sendCrmText } from '@/workspace/lib/crmClient';
import TemplatePicker from './TemplatePicker';

const WINDOW_CLOSED_HINT = 'Fora da janela de atendimento de 24h da Meta -- envie um template aprovado.';

export default function MessageComposer({
  conversationId,
  sellerId,
  onSent,
}: {
  conversationId: string;
  sellerId: string;
  onSent: () => void;
}) {
  const [withinWindow, setWithinWindow] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChecking(true);
    setWithinWindow(null);
    setError(null);
    fetchCrmServiceWindow(conversationId)
      .then((status) => {
        if (!cancelled) setWithinWindow(status.withinWindow);
      })
      .catch(() => {
        // Falha ao consultar a janela não deve travar o envio -- deixa o
        // compositor habilitado e confia no 422 do próprio envio, se vier
        // (ver chat-backend-integration.md: a janela pode fechar entre a
        // consulta e o envio de qualquer forma).
        if (!cancelled) setWithinWindow(true);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  async function handleSend() {
    const value = text.trim();
    if (!value) return;
    setSending(true);
    setError(null);
    try {
      await sendCrmText(conversationId, value);
      setText('');
      onSent();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.';
      // A mensagem de janela fechada que o backend devolve já é específica
      // o bastante para refletir o estado sem esperar o próximo poll.
      if (message.toLowerCase().includes('janela')) setWithinWindow(false);
      setError(message);
    } finally {
      setSending(false);
    }
  }

  const disabled = checking || withinWindow === false;

  return (
    <div className="border-t border-border bg-surface px-4 py-3 sm:px-6">
      {error && <p className="mb-2 text-sm text-[#b00020]">{error}</p>}
      <div className="flex items-end gap-2">
        <DisabledActionHint reason={disabled ? WINDOW_CLOSED_HINT : undefined} side="top">
          <textarea
            className="min-h-11 w-full resize-none rounded-lg border border-[#ddd] bg-white px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:bg-brand-background"
            rows={1}
            placeholder={checking ? 'Verificando janela de atendimento...' : disabled ? 'Fora da janela de 24h -- use um template.' : 'Escreva uma mensagem...'}
            value={text}
            disabled={disabled || sending}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
        </DisabledActionHint>
        <button type="button" className={adminUi.button} onClick={() => setShowTemplates(true)}>Template</button>
        <button
          type="button"
          className={adminUi.primaryButton}
          onClick={() => void handleSend()}
          disabled={disabled || sending || !text.trim()}
          aria-label="Enviar mensagem"
        >
          <Send className="size-4" aria-hidden="true" />
        </button>
      </div>

      {showTemplates && (
        <TemplatePicker
          conversationId={conversationId}
          sellerId={sellerId}
          onClose={() => setShowTemplates(false)}
          onSent={() => {
            setShowTemplates(false);
            onSent();
          }}
        />
      )}
    </div>
  );
}
