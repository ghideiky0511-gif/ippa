'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '@/domain/clients/types';

interface AdminAuthContextValue {
  adminUser: AuthUser | null;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue>({
  adminUser: null,
  logout: async () => {},
});

// Quem está logada na plataforma admin — só pra exibir (nome/perfil no
// AdminNav) e oferecer "Sair". O bloqueio de verdade é feito pelo
// proxy.js (antes da página nem renderizar); este provider não protege
// nada sozinho.
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [adminUser, setAdminUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    fetch('/api/admin-session/me', { cache: 'no-store' })
      .then((r): Promise<AuthUser | null> | null => (r.ok ? r.json() : null))
      .then(setAdminUser)
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch('/api/admin-session/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }

  return <AdminAuthContext.Provider value={{ adminUser, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
