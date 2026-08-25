'use client';
import { adminUi } from '@/workspace/lib/ui';
import Link from '@/components/TenantLink';
import { useTenant } from '@/components/TenantProvider';
import { useWorkspaceAuth } from '@/workspace/components/WorkspaceAuthProvider';
import { HubHeader } from '@/workspace/components/shared/HubHeader';
import { WORKSPACE_NAV_GROUPS } from '@/workspace/navigation/navigation';

export default function OverviewApp() {
  const { tenant } = useTenant();
  const { workspaceUser } = useWorkspaceAuth();
  const groups = WORKSPACE_NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => item.href !== '/workspace') }))
    .filter((group) => group.items.length > 0);

  return (
    <div>
      <HubHeader title="Visão geral" description={`Workspace interno de ${tenant.name || tenant.slug}.`} />

      <main className={`${adminUi.productsEditor} flex flex-col gap-6`}>
        <p className={adminUi.hint}>
          {workspaceUser ? `Olá, ${workspaceUser.name}. ` : ''}
          Escolha uma área abaixo para começar.
        </p>

        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{group.label}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className="flex flex-col items-start gap-2 rounded-brand border border-border bg-surface p-4 shadow-card transition-transform active:scale-[.98] hover:border-brand-primary">
                    <Icon className="size-5 text-brand-primary" aria-hidden="true" />
                    <span className="text-sm font-semibold text-foreground">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
