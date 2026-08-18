import type { ReactNode } from "react";
import ConditionalShell from "@/components/ConditionalShell";
import { getCategoryTree } from "@/lib/catalogFacets";
import { backendJson, backendRequest } from "@/lib/backend";
import type { AuthUser } from "@/domain/clients/types";
import type { Product } from "@/domain/products/types";
import "./globals.css";

// productOverrides.json é editado pela plataforma admin (fora deste app) e
// precisa refletir aqui sem rebuild — mesmo motivo de web/src/app/page.tsx.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Catálogo — Fashion Girl Atacado (MVP)",
  description: "Catálogo com filtros, carrinho e checkout via WhatsApp",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [catalog, authResponse] = await Promise.all([
    backendJson<Product[]>('/api/catalog'),
    backendRequest('/api/auth/me'),
  ]);
  const categoryTree = getCategoryTree(catalog);
  const authPayload = authResponse.ok
    ? await authResponse.json() as { user: AuthUser | null }
    : { user: null };
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#f7f5f6] font-sans text-[#2a2a2a]">
        <ConditionalShell categoryTree={categoryTree} authUser={authPayload.user}>
          {children}
        </ConditionalShell>
      </body>
    </html>
  );
}
