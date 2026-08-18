'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminAuth } from './AdminAuthProvider';

const LINKS = [
  { href: '/admin/builder', label: 'Home' },
  { href: '/admin/catalogo', label: 'Catálogo' },
  { href: '/admin/colecoes', label: 'Coleções' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/descontos', label: 'Descontos' },
  { href: '/admin/ferramentas', label: 'Ferramentas' },
  { href: '/admin/usuarios', label: 'Usuários' },
];

export default function AdminNav() {
  const pathname = usePathname();
  const { adminUser, logout } = useAdminAuth();
  return (
    <nav className="flex gap-1">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-md px-2.5 py-1.5 text-[13px] ${pathname?.startsWith(link.href) ? 'bg-brand-background font-semibold text-brand-primary' : 'text-brand-muted hover:bg-brand-background'}`}
        >
          {link.label}
        </Link>
      ))}
      {adminUser && (
        <span className="ml-2 flex items-center gap-2 text-[13px] text-brand-muted">
          {adminUser.name}
          <button type="button" className="border-0 bg-transparent p-0 text-[13px] text-brand-muted underline-offset-2 hover:underline" onClick={logout}>Sair</button>
        </span>
      )}
    </nav>
  );
}
