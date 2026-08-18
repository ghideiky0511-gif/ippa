'use client';
import { adminUi } from '@/workspace/lib/ui';
import WorkspaceNav from '@/workspace/navigation/WorkspaceNav';
import Link from '@/components/TenantLink';
import { useTenant } from '@/components/TenantProvider';
import { useWorkspaceAuth } from '@/workspace/components/WorkspaceAuthProvider';
import { WORKSPACE_NAV_ITEMS } from '@/workspace/navigation/navigation';

export default function OverviewApp() {
  const { tenant } = useTenant();
  const { workspaceUser } = useWorkspaceAuth();
  const shortcuts = WORKSPACE_NAV_ITEMS.filter((item) => item.href !== '/workspace');

  return (
    <div>
      <div className={adminUi.topbar}>
        <div className={adminUi.topbarLeft}>
          <h1>Visão geral</h1>
          <WorkspaceNav />
        </div>
      </div>

      <main className={adminUi.productsEditor}>
        <p className={adminUi.hint}>
          {workspaceUser ? `Olá, ${workspaceUser.name}. ` : ''}
          Workspace interno de {tenant.name || tenant.slug}.
        </p>

        <div className={adminUi.toolsList}>
          {shortcuts.map((item) => (
            <Link key={item.href} href={item.href} className={adminUi.toolRow}>
              {item.label}
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
