'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CartItem, OrderSession, ShippingOption } from '@/domain/orders/types';

// Contrato mínimo que CartProvider.tsx precisa pra escrever num pedido
// compartilhado — mesmo formato que TalaoProvider.tsx expõe (ver
// TalaoContextValue), só que reduzido: a cliente não cria/fecha/reabre
// sessões nem vincula cadastro, essas são ações da vendedora.
interface ClientSessionContextValue {
  activeSession: OrderSession | null;
  updateActiveItems: (items: CartItem[]) => Promise<void>;
  updateActiveShipping: (shipping: ShippingOption | null) => Promise<void>;
}

const ClientSessionContext = createContext<ClientSessionContextValue | null>(null);

// Contraparte de TalaoProvider.tsx pro lado da cliente — deliberadamente um
// contexto SEPARADO (não reaproveita TalaoContext): /frete, /pagamento e
// useTalaoClientGate.ts leem useTalao() diretamente pra decidir UI
// exclusiva da vendedora ("gerar link de pagamento", bloqueio de checkout
// direto). Se a cliente alimentasse o mesmo contexto, essas telas
// mostrariam a UI errada pra ela. Mantendo os dois separados, essas telas
// não precisam de nenhuma mudança — continuam corretas porque useTalao()
// segue exclusivo de vendedora (ver AppShell.tsx, só monta
// ClientSessionProvider pra role 'cliente').
export function ClientSessionProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<OrderSession | null>(null);

  function refetch() {
    return fetch('/api/sessions/mine', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((session: OrderSession | null) => setActiveSession(session))
      .catch(() => {});
  }

  useEffect(() => {
    refetch();
  }, []);

  // Tempo real: a vendedora mexendo no mesmo pedido (outra aba/dispositivo)
  // reflete aqui sem F5 — mesmo hub que TalaoProvider.tsx usa pro lado
  // dela, ver web/src/lib/sseHub.ts (canal client:<clientId> aqui).
  useEffect(() => {
    const source = new EventSource('/api/sessions/stream');
    source.addEventListener('sessions-updated', () => refetch());
    return () => source.close();
  }, []);

  async function updateActiveItems(items: CartItem[]) {
    if (!activeSession) return;
    const id = activeSession.id;
    setActiveSession((prev) => (prev && prev.id === id ? { ...prev, items } : prev));
    await fetch(`/api/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  }

  async function updateActiveShipping(shipping: ShippingOption | null) {
    if (!activeSession) return;
    const id = activeSession.id;
    setActiveSession((prev) => (prev && prev.id === id ? { ...prev, shipping: shipping || undefined } : prev));
    await fetch(`/api/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipping }),
    });
  }

  const value = useMemo<ClientSessionContextValue>(
    () => ({ activeSession, updateActiveItems, updateActiveShipping }),
    [activeSession]
  );

  return <ClientSessionContext.Provider value={value}>{children}</ClientSessionContext.Provider>;
}

// null quando não está dentro de <ClientSessionProvider> (vendedora,
// anônimo, ou cliente logada ainda sem o provider montado) — CartProvider
// trata isso como "sem sessão compartilhada", não é erro.
export function useClientSession(): ClientSessionContextValue | null {
  return useContext(ClientSessionContext);
}
