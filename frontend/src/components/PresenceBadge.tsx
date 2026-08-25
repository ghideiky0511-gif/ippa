'use client';

import { publicUi } from '@/lib/ui';
import { OrderSessionPeopleWidget } from './OrderSessionPeopleWidget';
import { useClientSession } from './ClientSessionProvider';

// Camada persistente para a cliente: o Socket determina quem está online e
// a lista persistida também deixa visível quem já participou do atendimento.
export default function PresenceBadge() {
  const clientSession = useClientSession();
  const session = clientSession?.activeSession ?? null;

  if (!session) return null;

  return (
    <OrderSessionPeopleWidget
      presence={clientSession?.presence ?? []}
      participants={clientSession?.participants ?? []}
      className={publicUi.presence}
    />
  );
}
