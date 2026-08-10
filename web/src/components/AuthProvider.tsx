'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthUser } from '@/lib/types';

interface AuthContextValue {
  authUser: AuthUser | null;
  // false só quando ninguém está logado E a ferramenta "esconder preço de
  // quem não está logado" (/ferramentas, storeSettings.json `features.
  // hidePriceWithoutLogin`) está ligada — consumido por ProductCard.tsx e
  // ProductDetailContent.tsx pra trocar o preço por um link de login.
  showPrices: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// `authUser` vem pronto do servidor (layout.tsx já calcula via cookie, ver
// getUserFromToken em web/src/lib/auth.ts) — sem fetch nem flash pra esse
// dado. Só a ferramenta de esconder preço precisa de um fetch client-side
// (mesmo padrão já usado em ProductDetailContent.tsx pros toggles de
// pré-venda/pronta-entrega — mesmo "pisca antes do fetch resolver" aceito
// ali, ver PLANO-PROXIMOS-PASSOS.md): default local é ferramenta desligada
// (preço visível) até o fetch resolver.
export function AuthProvider({ authUser, children }: { authUser: AuthUser | null; children: ReactNode }) {
  const [hidePriceWithoutLogin, setHidePriceWithoutLogin] = useState(false);

  useEffect(() => {
    fetch('/api/store-settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setHidePriceWithoutLogin(s?.features?.hidePriceWithoutLogin === true))
      .catch(() => {});
  }, []);

  const showPrices = !!authUser || !hidePriceWithoutLogin;

  return <AuthContext.Provider value={{ authUser, showPrices }}>{children}</AuthContext.Provider>;
}

export function useAuthUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthUser precisa estar dentro de <AuthProvider>');
  return ctx;
}
