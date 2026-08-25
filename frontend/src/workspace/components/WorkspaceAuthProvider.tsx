'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '@/domain/clients/types';
import { useTenant } from '@/components/TenantProvider';

interface WorkspaceAuthContextValue {
  workspaceUser: AuthUser | null;
  updateWorkspaceUser: (user: AuthUser) => void;
  logout: () => Promise<void>;
}

const WorkspaceAuthContext = createContext<WorkspaceAuthContextValue>({
  workspaceUser: null,
  updateWorkspaceUser: () => {},
  logout: async () => {},
});

// Quem está logada no workspace interno — só pra exibir (nome/perfil no
// WorkspaceSidebar/WorkspaceMobileNav) e oferecer "Sair". O bloqueio de
// verdade é feito pelo proxy.ts (antes da página nem renderizar); este provider não protege
// nada sozinho.
export function WorkspaceAuthProvider({ children }: { children: ReactNode }) {
  const { href } = useTenant();
  const [workspaceUser, setWorkspaceUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    fetch('/api/workspace-session/me', { cache: 'no-store' })
      .then((r): Promise<AuthUser | null> | null => (r.ok ? r.json() : null))
      .then(setWorkspaceUser)
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch('/api/workspace-session/logout', { method: 'POST' });
    window.location.href = href('/workspace/login');
  }

  return <WorkspaceAuthContext.Provider value={{ workspaceUser, updateWorkspaceUser: setWorkspaceUser, logout }}>{children}</WorkspaceAuthContext.Provider>;
}

export function useWorkspaceAuth() {
  return useContext(WorkspaceAuthContext);
}
