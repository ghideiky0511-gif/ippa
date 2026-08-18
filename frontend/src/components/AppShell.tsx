'use client';

import type { ReactNode } from 'react';
import Link from '@/components/TenantLink';
import { ClipboardList, ShoppingBag } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { CartProvider, useCart } from './CartProvider';
import { TalaoProvider, useTalao } from './TalaoProvider';
import { ClientSessionProvider } from './ClientSessionProvider';
import { QuickViewProvider, useQuickView } from './QuickViewProvider';
import { AuthProvider } from './AuthProvider';
import CartDrawer from './CartDrawer';
import TalaoDrawer from './TalaoDrawer';
import PresenceBadge from './PresenceBadge';
import ProductQuickView from './ProductQuickView';
import SideMenu from './SideMenu';
import { publicUi } from '@/lib/ui';
import { useTenant } from './TenantProvider';
import type { AuthUser } from '@/domain/clients/types';
import type { CategoryTreeEntry } from '@/domain/catalog/types';

function GlobalQuickView() {
  const { quickViewProduct, closeQuickView } = useQuickView();
  return <ProductQuickView product={quickViewProduct} onClose={closeQuickView} />;
}

function TalaoButton() {
  const talao = useTalao();
  if (!talao) return null;
  return (
    <button className={publicUi.topnavCart} onClick={talao.openTalao} aria-label="Talão de pedidos">
      <ClipboardList className="size-5" aria-hidden="true" />
      <span className={publicUi.count}>{talao.openSessions.length}</span>
    </button>
  );
}

function TopNav({ categoryTree, authUser }: { categoryTree: CategoryTreeEntry[]; authUser: AuthUser | null }) {
  const { cartCount, openCart } = useCart();
  const { tenant, href } = useTenant();
  const router = useRouter();
  const pathname = usePathname();
  const isVendedora = authUser?.role === 'vendedora';
  const onCatalogPage = pathname?.startsWith(href('/catalogo')) || pathname?.startsWith('/catalogo');

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push(href('/login'));
    router.refresh();
  }

  return (
    <nav className={publicUi.topnav} aria-label="Navegação principal">
      <SideMenu categoryTree={categoryTree} />
      <Link href="/" className={publicUi.topnavBrand}>{tenant.name}</Link>
      <div className={publicUi.topnavLinks}>
        {!onCatalogPage && <Link href="/catalogo">Catálogo</Link>}
        <Link href="/pedidos">{isVendedora ? 'Minhas vendas' : 'Meus pedidos'}</Link>
        <button className={publicUi.topnavCart} onClick={openCart} aria-label="Carrinho">
          <ShoppingBag className="size-5" aria-hidden="true" />
          <span className={publicUi.count}>{cartCount}</span>
        </button>
        {isVendedora && <TalaoButton />}
        {authUser ? <button className={publicUi.topnavLogin} onClick={handleLogout}>Sair</button> : <Link href="/login" className={publicUi.topnavLogin}>Entrar</Link>}
      </div>
    </nav>
  );
}

export default function AppShell({ children, categoryTree, authUser }: {
  children: ReactNode;
  categoryTree: CategoryTreeEntry[];
  authUser: AuthUser | null;
}) {
  const isVendedora = authUser?.role === 'vendedora';
  const isCliente = authUser?.role === 'cliente';
  const body = (
    <AuthProvider authUser={authUser}>
      <QuickViewProvider>
        <CartProvider>
          <TopNav categoryTree={categoryTree} authUser={authUser} />
          {children}
          <CartDrawer />
          {isVendedora && <TalaoDrawer />}
          {isCliente && <PresenceBadge />}
          <GlobalQuickView />
        </CartProvider>
      </QuickViewProvider>
    </AuthProvider>
  );

  if (isVendedora) return <TalaoProvider>{body}</TalaoProvider>;
  if (isCliente) return <ClientSessionProvider>{body}</ClientSessionProvider>;
  return body;
}
