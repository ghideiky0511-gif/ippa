import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import { catalog } from "@/lib/catalog";
import { getCategoryTree } from "@/lib/catalogFacets";
import "./globals.css";

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

export default function RootLayout({ children }: { children: ReactNode }) {
  const categoryTree = getCategoryTree(catalog);
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AppShell categoryTree={categoryTree}>{children}</AppShell>
      </body>
    </html>
  );
}
