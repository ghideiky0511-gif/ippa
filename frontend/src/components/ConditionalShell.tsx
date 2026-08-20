'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AppShell from './AppShell';
import type { AuthUser } from '@/domain/clients/types';
import type { CategoryTreeEntry } from '@/domain/catalog/types';
import { useTenant } from './TenantProvider';

// /login, /cadastro e /pagar são as únicas páginas sem o shell do catálogo
// público (AppShell) — o talão da vendedora agora vive dentro do próprio
// /catalogo (ver TalaoDrawer.tsx), não precisa mais de rota separada.
// /pagar/[token] é o link de pagamento público (ver POST
// /api/sessions/[id]/payment-link/route.ts) — precisa funcionar sem login,
// então nem faz sentido mostrar o topo do catálogo/carrinho ali.
const NO_SHELL_PREFIXES = ['/login', '/cadastro', '/confirmar-conta', '/pagar', '/workspace'];

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
  const { tenant } = useTenant();
  const tenantPath = pathname?.startsWith(`/${tenant.slug}`) ? pathname.slice(tenant.slug.length + 1) || '/' : pathname;
  const skipShell = NO_SHELL_PREFIXES.some((prefix) => tenantPath?.startsWith(prefix));
  if (skipShell) return <>{children}</>;
  return (
    <AppShell categoryTree={categoryTree} authUser={authUser}>
      {children}
    </AppShell>
  );
}
