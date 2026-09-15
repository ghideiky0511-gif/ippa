'use client';

import Link from '@/components/TenantLink';
import { usePathname } from 'next/navigation';
import { useTenant } from '@/components/TenantProvider';
import { adminUi } from '@/workspace/lib/ui';
import { WORKSPACE_NAV_GROUPS } from '@/workspace/navigation/navigation';

export default function WorkspaceNavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { href } = useTenant();

  return (
    <nav className="flex flex-col gap-5">
      {WORKSPACE_NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{group.label}</p>
          {group.items.map((item) => {
            const target = href(item.href);
            const isActive = item.href === '/workspace' ? pathname === target : pathname?.startsWith(target);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`${adminUi.workspaceNavItem} ${
                  isActive ? 'bg-brand-background text-brand-primary' : 'text-foreground hover:bg-brand-background hover:text-brand-primary'
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
