'use client';

import { ChevronLeft } from 'lucide-react';
import { useTenant } from '@/components/TenantProvider';
import Link from '@/components/TenantLink';
import { NotificationCenter } from '@/components/notification-center';
import { Button } from '@/components/ui/button';
import { useWorkspaceAuth } from '@/workspace/components/WorkspaceAuthProvider';
import WorkspaceNavList from './WorkspaceNavList';

export default function WorkspaceSidebar({ onClose }: { onClose?: () => void }) {
  const { tenant } = useTenant();
  const { workspaceUser, logout } = useWorkspaceAuth();

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex min-h-16 items-center justify-between gap-2 border-b border-border px-5">
        <span className="truncate text-sm font-extrabold text-foreground">{tenant.name || tenant.slug}</span>
        <div className="flex items-center gap-1">
          <NotificationCenter />
          {onClose && (
            <Button variant="ghost" size="md" className="min-h-0 rounded-full px-3" aria-label="Fechar menu" onClick={onClose}>
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <WorkspaceNavList />
      </div>
      {workspaceUser && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Link href="/workspace/perfil" className="flex min-w-0 items-center gap-2 rounded-control p-1 -m-1 hover:bg-brand-background" title="Editar meu perfil">
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-primary text-xs font-extrabold text-white">
              {workspaceUser.avatarUrl ? <img className="size-full object-cover" src={workspaceUser.avatarUrl} alt="" /> : workspaceUser.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
            </span>
            <span className="truncate text-sm font-semibold text-foreground">{workspaceUser.name}</span>
          </Link>
          <button type="button" className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:text-brand-primary hover:underline" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      )}
    </aside>
  );
}
