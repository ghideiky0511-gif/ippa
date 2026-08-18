'use client';
import Link from '@/components/TenantLink';
import { usePathname } from 'next/navigation';
import { useWorkspaceAuth } from '../components/WorkspaceAuthProvider';
import { useTenant } from '@/components/TenantProvider';
import { WORKSPACE_NAV_ITEMS } from './navigation';

export default function WorkspaceNav() {
  const pathname = usePathname();
  const { workspaceUser, logout } = useWorkspaceAuth();
  const { href } = useTenant();
  return (
    <nav className="flex gap-1">
      {WORKSPACE_NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-md px-2.5 py-1.5 text-[13px] ${pathname?.startsWith(href(item.href)) || pathname?.startsWith(item.href) ? 'bg-brand-background font-semibold text-brand-primary' : 'text-brand-muted hover:bg-brand-background'}`}
        >
          {item.label}
        </Link>
      ))}
      {workspaceUser && (
        <span className="ml-2 flex items-center gap-2 text-[13px] text-brand-muted">
          {workspaceUser.name}
          <button type="button" className="border-0 bg-transparent p-0 text-[13px] text-brand-muted underline-offset-2 hover:underline" onClick={logout}>Sair</button>
        </span>
      )}
    </nav>
  );
}
