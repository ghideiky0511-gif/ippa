'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AppShell from './AppShell';
import type { AuthUser, CategoryTreeEntry } from '@/lib/types';

// /login é a única página sem o shell do catálogo público (AppShell) — o
// talão da vendedora agora vive dentro do próprio /catalogo (ver
// TalaoDrawer.tsx), não precisa mais de rota separada.
const NO_SHELL_PREFIXES = ['/login'];

export default function ConditionalShell({
  children,
  categoryTree,
  authUser,
}: {
  children: ReactNode;
  categoryTree: CategoryTreeEntry[];
  authUser: AuthUser | null;
}) {
  const pathname = usePathname();
  const skipShell = NO_SHELL_PREFIXES.some((prefix) => pathname?.startsWith(prefix));
  if (skipShell) return <>{children}</>;
  return (
    <AppShell categoryTree={categoryTree} authUser={authUser}>
      {children}
    </AppShell>
  );
}
