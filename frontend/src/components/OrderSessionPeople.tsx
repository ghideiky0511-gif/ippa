'use client';

import type { PedidoParticipant, PedidoPresence } from '@/lib/realtime/usePedidoRealtime';

function roleLabel(role: PedidoPresence['role']): string {
  return {
    administrador: 'Administrador',
    vendedora: 'Vendedora',
    expedicao: 'Expedição',
    entregador: 'Entregador',
    cliente: 'Cliente',
  }[role];
}

function lastSeenLabel(lastLeftAt?: string): string {
  if (!lastLeftAt) return 'Saiu recentemente';
  const date = new Date(lastLeftAt);
  if (Number.isNaN(date.getTime())) return 'Saiu recentemente';
  return `Saiu às ${new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
  }).format(date)}`;
}

export function OrderSessionPeople({
  presence,
  participants,
  className = '',
  onMinimize,
}: {
  presence: PedidoPresence[];
  participants: PedidoParticipant[];
  className?: string;
  onMinimize?: () => void;
}) {
  const onlineIds = new Set(presence.map((person) => person.userId));
  const people = new Map(participants.map((participant) => [participant.userId, participant]));
  for (const person of presence) {
    if (!people.has(person.userId)) {
      people.set(person.userId, {
        userId: person.userId,
        firstJoinedAt: '',
        lastJoinedAt: '',
        joinCount: 1,
        user: { id: person.userId, name: person.name, role: person.role },
      });
    }
  }
  const rows = [...people.values()].sort((a, b) => {
    const onlineDifference = Number(onlineIds.has(b.userId)) - Number(onlineIds.has(a.userId));
    return onlineDifference || b.lastJoinedAt.localeCompare(a.lastJoinedAt);
  });

  return (
    <section className={`rounded-brand border border-border bg-white p-2.5 shadow-md ${className}`} aria-label="Pessoas neste pedido">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold">Pessoas neste pedido</h2>
          <p className="mt-0.5 text-[11px] text-brand-muted">
            {presence.length === 1 ? '1 pessoa online agora' : `${presence.length} pessoas online agora`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />Ao vivo
          </span>
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              className="text-[11px] text-brand-muted hover:text-brand-text"
              aria-label="Minimizar pessoas neste pedido"
            >
              Minimizar
            </button>
          )}
        </div>
      </div>
      {rows.length > 0 ? (
        <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto" aria-live="polite">
          {rows.map((participant) => {
            const online = onlineIds.has(participant.userId);
            return <li key={participant.userId} className="flex items-center gap-2 text-xs">
              <span className={`size-1.5 shrink-0 rounded-full ${online ? 'bg-emerald-500' : 'bg-brand-muted/45'}`} aria-label={online ? 'Online' : 'Offline'} />
              <span className="min-w-0 flex-1 truncate font-medium">{participant.user.name}</span>
              <span className="shrink-0 text-[11px] text-brand-muted">{online ? roleLabel(participant.user.role) : lastSeenLabel(participant.lastLeftAt)}</span>
            </li>;
          })}
        </ul>
      ) : <p className="mt-2 text-[11px] text-brand-muted">Conectando pessoas deste pedido…</p>}
    </section>
  );
}
