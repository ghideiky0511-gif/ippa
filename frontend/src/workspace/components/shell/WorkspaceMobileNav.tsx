'use client';

import { useState } from 'react';
import { useTenant } from '@/components/TenantProvider';
import Link from '@/components/TenantLink';
import { useWorkspaceAuth } from '@/workspace/components/WorkspaceAuthProvider';
import { Sheet, SheetContent, SheetHeader, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import WorkspaceNavList from './WorkspaceNavList';

export default function WorkspaceMobileNav() {
  const { tenant } = useTenant();
  const { workspaceUser, logout } = useWorkspaceAuth();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" className="flex size-11 items-center justify-center rounded-control text-foreground hover:bg-brand-background" aria-label="Abrir menu">
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(20rem,86vw)]">
        <SheetHeader>
          <span className="truncate text-sm font-extrabold text-foreground">{tenant.name || tenant.slug}</span>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <WorkspaceNavList onNavigate={() => setOpen(false)} />
        </div>
        {workspaceUser && (
          <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
            <Link href="/workspace/perfil" onClick={() => setOpen(false)} className="flex min-w-0 items-center gap-2 rounded-control p-1 -m-1 hover:bg-brand-background" title="Editar meu perfil">
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
      </SheetContent>
    </Sheet>
  );
}
