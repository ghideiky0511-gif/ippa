'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CartProvider, useCart } from './CartProvider';
import CartDrawer from './CartDrawer';
import SideMenu from './SideMenu';
import { CONFIG } from '@/lib/config';
import type { CategoryTreeEntry } from '@/lib/types';

function TopNav({ categoryTree }: { categoryTree: CategoryTreeEntry[] }) {
  const { cartCount, openCart } = useCart();
  return (
    <nav className="topnav">
      <SideMenu categoryTree={categoryTree} />
      <Link href="/" className="topnav-brand">
        {CONFIG.logoUrl ? <img src={CONFIG.logoUrl} alt={CONFIG.storeName} /> : CONFIG.storeName}
      </Link>
      <div className="topnav-links">
        <Link href="/catalogo">Catálogo</Link>
        <Link href="/pedidos">Meus pedidos</Link>
        <button className="topnav-cart" onClick={openCart}>
          🛍 <span className="count">{cartCount}</span>
        </button>
      </div>
    </nav>
  );
}

export default function AppShell({
  children,
  categoryTree,
}: {
  children: ReactNode;
  categoryTree: CategoryTreeEntry[];
}) {
  return (
    <CartProvider>
      <TopNav categoryTree={categoryTree} />
      {children}
      <CartDrawer />
    </CartProvider>
  );
}
