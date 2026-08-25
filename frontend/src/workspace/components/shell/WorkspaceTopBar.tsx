'use client';

import { useTenant } from '@/components/TenantProvider';
import { NotificationCenter } from '@/components/notification-center';
import WorkspaceMobileNav from './WorkspaceMobileNav';

export default function WorkspaceTopBar() {
  const { tenant } = useTenant();

  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-border bg-surface px-3 lg:hidden">
      <div className="flex flex-1 items-center gap-3">
        <WorkspaceMobileNav />
        <span className="truncate text-sm font-extrabold text-foreground">{tenant.name || tenant.slug}</span>
      </div>
      <NotificationCenter />
    </header>
  );
}
