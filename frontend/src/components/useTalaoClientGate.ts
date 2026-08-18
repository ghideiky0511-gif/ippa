'use client';

import { useEffect, useState } from 'react';
import { useTalao } from './TalaoProvider';
import { isClientComplete } from '@/lib/clientComplete';
import type { Client } from '@/domain/clients/types';

export interface TalaoClientGate {
  blocked: boolean;
  reason: 'no-client' | 'incomplete' | 'no-login' | null;
  openTalao: () => void;
}

// GET /api/clients/[id] inclui hasLogin (computado, não é campo de Client)
// — ver web/src/lib/auth.ts hasLoginForClient.
type ClientWithLogin = Client & { hasLogin?: boolean };

// "Completo" (nome+CPF/CNPJ+e-mail+CEP, ver isClientComplete em
// web/src/lib/clientComplete.ts) e "com login" (AuthUser de verdade, não só
// o cadastro rápido) passam a ser obrigatórios antes do frete quando o
// pedido é de uma sessão de talão (vendedora atendendo) — combinado com o
// usuário: mesmo quando é a vendedora quem monta o carrinho, a cliente
// precisa ter login pra qualquer um dos dois avançar (ela pode criar esse
// login ali mesmo no talão, ver CreateLoginSection em TalaoDrawer.tsx).
// Sem sessão ativa (cliente final comprando sozinha, ou vendedora sem talão
// aberto), o gate não se aplica — esses casos caem no gate de login comum
// (!authUser) das próprias páginas /frete e /pagamento.
export function useTalaoClientGate(): TalaoClientGate {
  const talao = useTalao();
  const clientId = talao?.activeSession?.clientId;
  const [client, setClient] = useState<ClientWithLogin | null>(null);

  useEffect(() => {
    if (!clientId) {
      setClient(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/clients/${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!cancelled) setClient(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const openTalao = () => talao?.openTalao();

  if (!talao?.activeSession) return { blocked: false, reason: null, openTalao };
  if (!clientId) return { blocked: true, reason: 'no-client', openTalao };
  if (client && !isClientComplete(client)) return { blocked: true, reason: 'incomplete', openTalao };
  if (client && !client.hasLogin) return { blocked: true, reason: 'no-login', openTalao };
  return { blocked: false, reason: null, openTalao };
}
