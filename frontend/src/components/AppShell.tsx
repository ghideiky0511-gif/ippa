'use client';

import type { ReactNode } from 'react';
import Link from '@/components/TenantLink';
import { ClipboardList, ShoppingBag } from 'lucide-react';
import { NotificationCenter } from './notification-center';
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
import CatalogFooter from './CatalogFooter';
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

const ROLE_LABEL: Record<AuthUser['role'], string> = {
  administrador: 'Administradora',
  vendedora: 'Vendedora',
  expedicao: 'Expedição',
  entregador: 'Entregador(a)',
  cliente: 'Cliente',
};

function profileInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

function HeaderProfile({ user }: { user: AuthUser }) {
  return (
    <div className={publicUi.topnavProfile} title={`${user.name} · ${ROLE_LABEL[user.role]}`}>
      <div className={publicUi.topnavProfileInfo}>
        <p className={publicUi.topnavProfileName}>{user.name}</p>
        <p className={publicUi.topnavProfileRole}>{ROLE_LABEL[user.role]}</p>
      </div>
      <span className={publicUi.topnavAvatar} aria-label={`Foto de perfil de ${user.name}`}>
        {user.avatarUrl ? <img className="size-full object-cover" src={user.avatarUrl} alt="" /> : profileInitials(user.name)}
      </span>
    </div>
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
    router.push(href('/'));
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
        {authUser && <NotificationCenter />}
        {isVendedora && <TalaoButton />}
        {authUser && <HeaderProfile user={authUser} />}
        {authUser ? <button className={publicUi.topnavLogin} onClick={handleLogout}>Sair</button> : <Link href="/login" className={publicUi.topnavLogin}>Entrar</Link>}
      </div>
    </nav>
  );
}

export default function AppShell({ children, categoryTree, authUser, publicCatalogPrices }: {
  children: ReactNode;
  categoryTree: CategoryTreeEntry[];
  authUser: AuthUser | null;
  publicCatalogPrices: boolean;
}) {
  const isVendedora = authUser?.role === 'vendedora';
  const isCliente = authUser?.role === 'cliente';
  const body = (
    <AuthProvider authUser={authUser} publicCatalogPrices={publicCatalogPrices}>
      <QuickViewProvider>
        <CartProvider>
          <div className="flex min-h-screen flex-col">
            <TopNav categoryTree={categoryTree} authUser={authUser} />
            <div className="flex-1">{children}</div>
            <CatalogFooter />
          </div>
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
