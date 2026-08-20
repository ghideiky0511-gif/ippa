'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useTenant } from '@/components/TenantProvider';
import WorkspaceSidebar from './WorkspaceSidebar';
import WorkspaceTopBar from './WorkspaceTopBar';

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const tenantPath = pathname?.startsWith(`/${tenant.slug}`) ? pathname.slice(tenant.slug.length + 1) || '/' : pathname;
  const isLogin = tenantPath?.startsWith('/workspace/login');

  if (isLogin) return <>{children}</>;

  return (
    <>
      <WorkspaceSidebar />
      <WorkspaceTopBar />
      <main className="lg:pl-64">{children}</main>
    </>
  );
}
