'use client';

import Link from 'next/link';
import { CartProvider, useCart } from './CartProvider';
import CartDrawer from './CartDrawer';
import { CONFIG } from '@/lib/config';

function TopNav() {
  const { cartCount, openCart } = useCart();
  return (
    <nav className="topnav">
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

export default function AppShell({ children }) {
  return (
    <CartProvider>
      <TopNav />
      {children}
      <CartDrawer />
    </CartProvider>
  );
}
