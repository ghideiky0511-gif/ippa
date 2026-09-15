'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useTenant } from '@/components/TenantProvider';
import { workspacePathname } from '@/workspace/lib/pageIdentity';
import WorkspaceSidebar from './WorkspaceSidebar';
import WorkspacePageTransition from './WorkspacePageTransition';
import WorkspaceTopBar from './WorkspaceTopBar';

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const tenantPath = workspacePathname(pathname ?? '/', tenant.slug);
  const isLogin = tenantPath.startsWith('/workspace/login');

  if (isLogin) {
    return (
      <WorkspacePageTransition pathname={tenantPath}>
        {children}
      </WorkspacePageTransition>
    );
  }

  return (
    <>
      {sidebarOpen && <WorkspaceSidebar onClose={() => setSidebarOpen(false)} />}
      <WorkspaceTopBar sidebarOpen={sidebarOpen} onOpenSidebar={() => setSidebarOpen(true)} />
      <main className={sidebarOpen ? 'lg:pl-64' : ''}>
        <WorkspacePageTransition pathname={tenantPath}>
          {children}
        </WorkspacePageTransition>
      </main>
    </>
  );
}
