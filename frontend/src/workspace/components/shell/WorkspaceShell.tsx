'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useTenant } from '@/components/TenantProvider';
import { Button } from '@/components/ui/button';
import { adminUi } from '@/workspace/lib/ui';
import WorkspaceSidebar from './WorkspaceSidebar';
import WorkspaceTopBar from './WorkspaceTopBar';

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const tenantPath = pathname?.startsWith(`/${tenant.slug}`) ? pathname.slice(tenant.slug.length + 1) || '/' : pathname;
  const isLogin = tenantPath?.startsWith('/workspace/login');

  if (isLogin) return <>{children}</>;

  return (
    <>
      {sidebarOpen && <WorkspaceSidebar onClose={() => setSidebarOpen(false)} />}
      {!sidebarOpen && (
        <Button
          variant="ghost"
          size="md"
          className={adminUi.sidebarTrigger}
          aria-label="Abrir menu"
          title="Abrir menu lateral"
          onClick={() => setSidebarOpen(true)}
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </Button>
      )}
      <WorkspaceTopBar />
      <main className={sidebarOpen ? 'lg:pl-64' : ''}>{children}</main>
    </>
  );
}
