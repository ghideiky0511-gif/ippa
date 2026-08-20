'use client';

import type { ReactNode } from 'react';
import Link from '@/components/TenantLink';
import { Button } from '@/components/ui/button';

export interface HubHeaderAction {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export function HubHeader({
  title,
  description,
  primaryAction,
  secondaryActions,
}: {
  title: string;
  description?: string;
  primaryAction?: HubHeaderAction;
  secondaryActions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
      <div>
        <h1 className="text-lg font-extrabold text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {secondaryActions}
        {primaryAction && (
          primaryAction.href ? (
            <Button asChild>
              <Link href={primaryAction.href}>{primaryAction.icon}{primaryAction.label}</Link>
            </Button>
          ) : (
            <Button type="button" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
              {primaryAction.icon}{primaryAction.label}
            </Button>
          )
        )}
      </div>
    </header>
  );
}
