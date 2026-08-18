'use client';
import { publicUi } from '@/lib/ui';

import { useEffect, useRef, useState } from 'react';
import { useClientSession } from './ClientSessionProvider';

// Indicador de presença — avisa a cliente, ao vivo, que uma vendedora está
// com o pedido dela aberta no talão (mesma sessão compartilhada que
// CartProvider.tsx usa, ver ClientSessionProvider.tsx). Só existe pra role
// 'cliente' com sessão atribuída (ver AppShell.tsx) — vendedora não precisa
// disso, ela já sabe que é ela mesma. `sellerName` vem resolvido pelo
// servidor (GET /api/sessions/mine, a partir de OrderSession.sellerId — ver
// types.ts) porque a sessão em si só guarda o id, não o nome.
//
// Minimizado é estado local (não persiste entre reloads de propósito —
// reaparecer com a animação de novo depois de um F5 é aceitável, é raro
// acontecer no meio de um atendimento) — cada sessão nova (id diferente)
// volta a aparecer expandida.
export default function PresenceBadge() {
  const clientSession = useClientSession();
  const [minimized, setMinimized] = useState(false);
  const session = clientSession?.activeSession ?? null;

  // Sessão trocou (ex.: pedido anterior fechou e uma nova foi atribuída) —
  // volta a mostrar expandida em vez de continuar minimizada da sessão
  // antiga.
  const prevSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (session && session.id !== prevSessionIdRef.current) {
      prevSessionIdRef.current = session.id;
      setMinimized(false);
    }
  }, [session?.id]);

  if (!session) return null;

  const sellerName = session.sellerName || 'Vendedora';
  const initial = sellerName.trim().charAt(0).toUpperCase() || 'V';

  return (
    <div className={[publicUi.presence, minimized ? 'gap-0' : ''].join(' ')}>
      <button
        type="button"
        className={publicUi.presenceAvatar}
        onClick={() => setMinimized((v) => !v)}
        aria-label={minimized ? `Mostrar aviso de presença de ${sellerName}` : 'Minimizar aviso de presença'}
      >
        {initial}
      </button>
      {!minimized && (
        <div className={publicUi.presenceMessage}>
          <span>
            A vendedora <strong>{sellerName}</strong> está no pedido com você
          </span>
          <button type="button" className={publicUi.presenceMinimize} onClick={() => setMinimized(true)} aria-label="Minimizar">
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
