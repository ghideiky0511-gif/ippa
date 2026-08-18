// @ts-nocheck
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
    <nav className="admin-nav">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={pathname?.startsWith(link.href) ? 'active' : ''}>
          {link.label}
        </Link>
      ))}
      {adminUser && (
        <span className="admin-nav-user">
          {adminUser.name}
          <button type="button" className="admin-nav-logout" onClick={logout}>Sair</button>
        </span>
      )}
    </nav>
  );
}
