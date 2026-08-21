'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { AuthUser } from '@/domain/clients/types';

interface AuthContextValue {
  authUser: AuthUser | null;
  // false só quando ninguém está logado e o tenant desligou a exibição de
  // preços no catálogo público.
  showPrices: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// As duas informações chegam prontas do servidor. Assim, a primeira pintura
// do catálogo já respeita o tenant, sem mostrar o preço por um instante.
export function AuthProvider({ authUser, publicCatalogPrices, children }: { authUser: AuthUser | null; publicCatalogPrices: boolean; children: ReactNode }) {
  // Links públicos gerados no atendimento podem solicitar uma versão de
  // vitrine sem preços. É uma escolha da apresentação do link, independente
  // da regra global que já esconde preço para visitantes sem login.
  const [forceHiddenPrices] = useState(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('precos') === 'ocultos'
  );

  const showPrices = !forceHiddenPrices && (!!authUser || publicCatalogPrices);

  return <AuthContext.Provider value={{ authUser, showPrices }}>{children}</AuthContext.Provider>;
}

export function useAuthUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthUser precisa estar dentro de <AuthProvider>');
  return ctx;
}
