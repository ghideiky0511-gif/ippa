import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import ConditionalShell from "@/components/ConditionalShell";
import { getCatalog } from "@/lib/catalog";
import { getCategoryTree } from "@/lib/catalogFacets";
import { getUserFromToken, SESSION_COOKIE } from "@/lib/auth";
import "./globals.css";

// productOverrides.json é editado pela plataforma admin (fora deste app) e
// precisa refletir aqui sem rebuild — mesmo motivo de web/src/app/page.tsx.
export const dynamic = 'force-dynamic';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Catálogo — Fashion Girl Atacado (MVP)",
  description: "Catálogo com filtros, carrinho e checkout via WhatsApp",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const catalog = await getCatalog();
  const categoryTree = getCategoryTree(catalog);
  const cookieStore = await cookies();
  const authUser = await getUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ConditionalShell categoryTree={categoryTree} authUser={authUser}>
          {children}
        </ConditionalShell>
      </body>
    </html>
  );
}
