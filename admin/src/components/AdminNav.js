'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/builder', label: 'Home' },
  { href: '/colecoes', label: 'Coleções' },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={pathname?.startsWith(link.href) ? 'active' : ''}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
