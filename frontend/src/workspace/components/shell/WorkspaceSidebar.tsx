'use client';

import { useTenant } from '@/components/TenantProvider';
import { NotificationCenter } from '@/components/notification-center';
import { useWorkspaceAuth } from '@/workspace/components/WorkspaceAuthProvider';
import WorkspaceNavList from './WorkspaceNavList';

export default function WorkspaceSidebar() {
  const { tenant } = useTenant();
  const { workspaceUser, logout } = useWorkspaceAuth();

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex min-h-16 items-center justify-between gap-2 border-b border-border px-5">
        <span className="truncate text-sm font-extrabold text-foreground">{tenant.name || tenant.slug}</span>
        <NotificationCenter />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <WorkspaceNavList />
      </div>
      {workspaceUser && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <span className="truncate text-sm font-semibold text-foreground">{workspaceUser.name}</span>
          <button type="button" className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:text-brand-primary hover:underline" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      )}
    </aside>
  );
}
