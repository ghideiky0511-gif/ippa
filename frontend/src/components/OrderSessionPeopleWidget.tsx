'use client';

import { useEffect, useRef, useState } from 'react';
import type { PedidoParticipant, PedidoPresence } from '@/lib/realtime/usePedidoRealtime';
import { OrderSessionPeople } from './OrderSessionPeople';

const AUTO_COLLAPSE_MS = 3500;

// Fica minimizado por padrão; só se expande sozinho por um instante quando
// alguém entra ou sai do pedido (mudança real de presença), depois volta a
// minimizar. Clique manual do usuário tem prioridade e fixa o estado aberto.
export function OrderSessionPeopleWidget({
  presence,
  participants,
  className = '',
}: {
  presence: PedidoPresence[];
  participants: PedidoParticipant[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pinnedOpenRef = useRef(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signatureRef = useRef<string | null>(null);
  const signature = `${presence.map((person) => person.userId).sort().join(',')}|${participants.length}`;

  useEffect(() => {
    if (signatureRef.current === null) {
      signatureRef.current = signature;
      return;
    }
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;
    if (pinnedOpenRef.current) return;
    setOpen(true);
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => setOpen(false), AUTO_COLLAPSE_MS);
  }, [signature]);

  useEffect(() => () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
  }, []);

  function toggle() {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setOpen((current) => {
      const next = !current;
      pinnedOpenRef.current = next;
      return next;
    });
  }

  return (
    <div className={className}>
      {open ? (
        <div className="w-[min(18rem,calc(100vw-2rem))] origin-top-left animate-[presence-pop_.22s_ease-out]">
          <OrderSessionPeople presence={presence} participants={participants} onMinimize={toggle} />
        </div>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label="Mostrar pessoas neste pedido"
          className="flex animate-[presence-pop_.2s_ease-out] items-center gap-1.5 rounded-full border border-border bg-white py-1.5 pr-3 pl-1.5 text-xs font-semibold text-brand-text shadow-md transition hover:border-brand-primary/40"
        >
          <span className="relative flex size-4 shrink-0 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/50" aria-hidden="true" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          </span>
          {presence.length}
        </button>
      )}
    </div>
  );
}
