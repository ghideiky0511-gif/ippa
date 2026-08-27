import type { Metadata } from 'next';
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import ConditionalShell from "@/components/ConditionalShell";
import { TenantProvider } from '@/components/TenantProvider';
import { AppToaster } from '@/components/ui/toaster';
import { z } from "zod";
import { backendJson, backendRequest } from "@/lib/backend";
import type { AuthUser } from "@/domain/clients/types";
import { CategoryTreeEntrySchema, StoreSettingsSchema, type CategoryTreeEntry } from "@/domain/catalog/types";
import { TenantProfileSchema, type TenantProfile } from '@/domain/tenant/types';
import { cacheTag } from "@/lib/cacheTags";
import "./tailwind.css";

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
  fallback: ['system-ui', 'Arial', 'sans-serif'],
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-cormorant',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
});

// productOverrides.json é editado pela plataforma admin (fora deste app) e
// precisa refletir aqui sem rebuild — mesmo motivo de web/src/app/page.tsx.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  if (incomingHeaders.get('x-ippa-institutional') === '1') {
    return { title: 'IPPA', description: 'Site institucional da IPPA' };
  }
  if (incomingHeaders.get('x-ippa-control') === '1') {
    return { title: 'Control IPPA', description: 'Gestão de tenants da plataforma IPPA' };
  }
  const tenantSlug = incomingHeaders.get('x-ippa-tenant') ?? '';
  const tenant = await backendJson('/api/tenant', TenantProfileSchema, {
    next: { revalidate: 60, tags: tenantSlug ? [cacheTag('tenant', tenantSlug)] : [] },
  });
  return { title: `Catálogo — ${tenant.name}`, description: `Catálogo de ${tenant.name}` };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const incomingHeaders = await headers();
  if (incomingHeaders.get('x-ippa-institutional') === '1') {
    return (
      <html lang="pt-BR" className={`${manrope.variable} ${cormorant.variable}`}>
        <body className="min-h-screen bg-surface-muted font-sans text-foreground">{children}</body>
      </html>
    );
  }
  if (incomingHeaders.get('x-ippa-control') === '1') {
    return (
      <html lang="pt-BR" className={`${manrope.variable} ${cormorant.variable}`}>
        <body className="min-h-screen bg-surface-muted font-sans text-foreground">{children}<AppToaster /></body>
      </html>
    );
  }
  const tenantSlug = incomingHeaders.get('x-ippa-tenant') ?? '';
  const [categoryTree, authResponse, tenant, storeSettings] = await Promise.all([
    backendJson('/api/categories', z.array(CategoryTreeEntrySchema), {
      next: { revalidate: 30, tags: tenantSlug ? [cacheTag('classifications', tenantSlug)] : [] },
    }),
    backendRequest('/api/auth/me'),
    backendJson('/api/tenant', TenantProfileSchema, {
      next: { revalidate: 60, tags: tenantSlug ? [cacheTag('tenant', tenantSlug)] : [] },
    }),
    backendJson('/api/store-settings', StoreSettingsSchema, {
      next: { revalidate: 30, tags: tenantSlug ? [cacheTag('storeSettings', tenantSlug)] : [] },
    }),
  ]);
  const authPayload = authResponse.ok
    ? await authResponse.json() as { user: AuthUser | null }
    : { user: null };
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${cormorant.variable}`}>
      <body className="min-h-screen bg-surface-muted font-sans text-foreground">
        <TenantProvider tenant={tenant}>
          <ConditionalShell
            categoryTree={categoryTree}
            authUser={authPayload.user}
            publicCatalogPrices={storeSettings.features?.publicCatalogPrices !== false}
            suggestedPiecesEnabled={storeSettings.features?.suggestedPieces !== false}
          >
            {children}
          </ConditionalShell>
        </TenantProvider>
        <AppToaster />
      </body>
    </html>
  );
}
