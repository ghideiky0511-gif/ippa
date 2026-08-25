'use client';

import { publicUi } from '@/lib/ui';
import { OrderSessionPeopleWidget } from './OrderSessionPeopleWidget';
import { useTalao } from './TalaoProvider';

// Equivalente de PresenceBadge.tsx pro lado da vendedora — mostra quem mais
// está acompanhando o pedido ativo do talão (outra vendedora, ou a própria
// cliente do lado dela).
export default function TalaoPresenceBadge() {
  const talao = useTalao();

  if (!talao?.activeSession) return null;

  return (
    <OrderSessionPeopleWidget
      presence={talao.presence}
      participants={talao.participants}
      className={publicUi.presence}
    />
  );
}
