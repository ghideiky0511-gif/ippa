'use client';

import { ChevronRight } from 'lucide-react';
import { useTenant } from '@/components/TenantProvider';
import { NotificationCenter } from '@/components/notification-center';
import { Button } from '@/components/ui/button';
import WorkspaceMobileNav from './WorkspaceMobileNav';

interface WorkspaceTopBarProps {
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
}

export default function WorkspaceTopBar({ sidebarOpen, onOpenSidebar }: WorkspaceTopBarProps) {
  const { tenant } = useTenant();

  return (
    <header className={`sticky top-0 z-30 min-h-14 items-center gap-3 border-b border-border bg-surface px-3 ${sidebarOpen ? 'flex lg:hidden' : 'flex'}`}>
      <div className="flex flex-1 items-center gap-3">
        <div className="lg:hidden">
          <WorkspaceMobileNav />
        </div>
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="md"
            className="hidden size-10 min-h-0 rounded-control p-0 text-muted-foreground hover:bg-brand-background hover:text-brand-primary lg:inline-flex"
            aria-label="Abrir menu lateral"
            title="Abrir menu lateral"
            onClick={onOpenSidebar}
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </Button>
        )}
        <span className="truncate text-sm font-extrabold text-foreground">{tenant.name || tenant.slug}</span>
      </div>
      <NotificationCenter />
    </header>
  );
}
