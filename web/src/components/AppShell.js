'use client';

import Link from 'next/link';
import { CartProvider, useCart } from './CartProvider';
import CartDrawer from './CartDrawer';

function TopNav() {
  const { cartCount, openCart } = useCart();
  return (
    <nav className="topnav">
      <Link href="/" className="topnav-brand">Catálogo</Link>
      <div className="topnav-links">
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
