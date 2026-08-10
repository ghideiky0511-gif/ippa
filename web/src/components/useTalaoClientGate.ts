'use client';

import { useEffect, useState } from 'react';
import { useTalao } from './TalaoProvider';
import { isClientComplete } from '@/lib/clientComplete';
import type { Client } from '@/lib/types';

export interface TalaoClientGate {
  blocked: boolean;
  reason: 'no-client' | 'incomplete' | null;
  openTalao: () => void;
}

// "Completo" (nome+CPF/CNPJ+e-mail+CEP, ver isClientComplete em
// web/src/lib/clients.ts) passa a ser obrigatório antes do frete quando o
// pedido é de uma sessão de talão (vendedora atendendo) — sem sessão ativa
// (cliente final comprando sozinha, ou vendedora sem talão aberto), o gate
// não se aplica, porque ainda não existe cadastro de cliente nesse fluxo.
export function useTalaoClientGate(): TalaoClientGate {
  const talao = useTalao();
  const clientId = talao?.activeSession?.clientId;
  const [client, setClient] = useState<Client | null>(null);

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
  return { blocked: false, reason: null, openTalao };
}
