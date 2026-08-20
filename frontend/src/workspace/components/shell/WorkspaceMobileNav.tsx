'use client';

import { useState } from 'react';
import { useTenant } from '@/components/TenantProvider';
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
            <span className="truncate text-sm font-semibold text-foreground">{workspaceUser.name}</span>
            <button type="button" className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:text-brand-primary hover:underline" onClick={() => void logout()}>
              Sair
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
