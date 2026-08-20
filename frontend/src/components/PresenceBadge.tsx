'use client';

import { useState } from 'react';
import { publicUi } from '@/lib/ui';
import { OrderSessionPeople } from './OrderSessionPeople';
import { useClientSession } from './ClientSessionProvider';

// Camada persistente para a cliente: o Socket determina quem estÃ¡ online e
// a lista persistida tambÃ©m deixa visÃ­vel quem jÃ¡ participou do atendimento.
export default function PresenceBadge() {
  const clientSession = useClientSession();
  const [minimized, setMinimized] = useState(false);
  const session = clientSession?.activeSession ?? null;

  if (!session) return null;

  return (
    <div className={`${publicUi.presence} flex-col items-start`}>
      {minimized ? (
        <button
          type="button"
          className={publicUi.presenceAvatar}
          onClick={() => setMinimized(false)}
          aria-label="Mostrar pessoas neste pedido"
        >
          {clientSession?.presence.length || 0}
        </button>
      ) : (
        <div className="relative w-[min(22rem,calc(100vw-2rem))]">
          <OrderSessionPeople
            presence={clientSession?.presence ?? []}
            participants={clientSession?.participants ?? []}
          />
          <button
            type="button"
            className="absolute top-2.5 right-2.5 text-xs text-brand-muted hover:text-brand-text"
            onClick={() => setMinimized(true)}
            aria-label="Minimizar pessoas neste pedido"
          >
            Minimizar
          </button>
        </div>
      )}
    </div>
  );
}
