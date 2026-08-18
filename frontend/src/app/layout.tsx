import type { Metadata } from 'next';
import type { ReactNode } from "react";
import { headers } from "next/headers";
import ConditionalShell from "@/components/ConditionalShell";
import { TenantProvider } from '@/components/TenantProvider';
import { getCategoryTree } from "@/lib/catalogFacets";
import { backendJson, backendRequest } from "@/lib/backend";
import type { AuthUser } from "@/domain/clients/types";
import type { Product } from "@/domain/products/types";
import type { TenantProfile } from '@/domain/tenant/types';
import "./tailwind.css";

// productOverrides.json é editado pela plataforma admin (fora deste app) e
// precisa refletir aqui sem rebuild — mesmo motivo de web/src/app/page.tsx.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  if (incomingHeaders.get('x-ippa-control') === '1') {
    return { title: 'Control IPPA', description: 'Gestão de tenants da plataforma IPPA' };
  }
  const tenant = await backendJson<TenantProfile>('/api/tenant');
  return { title: `Catálogo — ${tenant.name}`, description: `Catálogo de ${tenant.name}` };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const incomingHeaders = await headers();
  if (incomingHeaders.get('x-ippa-control') === '1') {
    return (
      <html lang="pt-BR">
        <body className="min-h-screen bg-[#f7f5f6] font-sans text-[#2a2a2a]">{children}</body>
      </html>
    );
  }
  const [catalog, authResponse, tenant] = await Promise.all([
    backendJson<Product[]>('/api/catalog'),
    backendRequest('/api/auth/me'),
    backendJson<TenantProfile>('/api/tenant'),
  ]);
  const categoryTree = getCategoryTree(catalog);
  const authPayload = authResponse.ok
    ? await authResponse.json() as { user: AuthUser | null }
    : { user: null };
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#f7f5f6] font-sans text-[#2a2a2a]">
        <TenantProvider tenant={tenant}>
          <ConditionalShell categoryTree={categoryTree} authUser={authPayload.user}>
            {children}
          </ConditionalShell>
        </TenantProvider>
      </body>
    </html>
  );
}
