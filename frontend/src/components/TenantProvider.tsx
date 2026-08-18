'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { TenantProfile } from '@/domain/tenant/types';

interface TenantContextValue {
  tenant: TenantProfile;
  href: (path: string) => string;
}

const TenantContext = createContext<TenantContextValue | null>(null);

function tenantHref(slug: string, path: string): string {
  if (!path.startsWith('/')) return path;
  const prefix = `/${slug}`;
  return path === prefix || path.startsWith(`${prefix}/`) ? path : `${prefix}${path}`;
}

export function TenantProvider({ tenant, children }: { tenant: TenantProfile; children: ReactNode }) {
  return (
    <TenantContext.Provider value={{ tenant, href: (path) => tenantHref(tenant.slug, path) }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) throw new Error('useTenant precisa estar dentro de <TenantProvider>.');
  return context;
}
