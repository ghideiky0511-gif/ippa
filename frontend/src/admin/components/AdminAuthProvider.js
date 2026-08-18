'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const AdminAuthContext = createContext({ adminUser: null, logout: () => {} });

// Quem está logada na plataforma admin — só pra exibir (nome/perfil no
// AdminNav) e oferecer "Sair". O bloqueio de verdade é feito pelo
// proxy.js (antes da página nem renderizar); este provider não protege
// nada sozinho.
export function AdminAuthProvider({ children }) {
  const [adminUser, setAdminUser] = useState(null);

  useEffect(() => {
    fetch('/api/admin-session/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
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
