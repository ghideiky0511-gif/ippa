'use client';

import type { ReactNode } from 'react';
import { LayoutGroup } from 'motion/react';
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
import TalaoPresenceBadge from './TalaoPresenceBadge';
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
  // Administradora tem adminAccess (ver isAdministrator no backend) e por
  // isso também opera o talão — mesmo bypass que proxy.ts usa pra liberar
  // o acesso a /catalogo. Só ela e a vendedora chegam aqui: cliente nunca
  // tem adminAccess nem role vendedora.
  const hasTalaoAccess = isVendedora || authUser?.permissions?.adminAccess === true;
  // "Meus pedidos" é o histórico de compras de uma cliente — não existe
  // pra quem está logada com papel interno (a versão dela desse conceito
  // é o talão: atendimentos atuais, ver TalaoButton/TalaoDrawer).
  const isInternal = authUser != null && authUser.role !== 'cliente';
  const onCatalogPage = pathname?.startsWith(href('/catalogo')) || pathname?.startsWith('/catalogo');

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push(href('/'));
    router.refresh();
  }

  return (
    <nav className={publicUi.topnav} aria-label="Navegação principal">
      <SideMenu categoryTree={categoryTree} authUser={authUser} />
      <Link href="/" className={publicUi.topnavBrand}>{tenant.name}</Link>
      <div className={publicUi.topnavLinks}>
        {!onCatalogPage && <Link href="/catalogo">Catálogo</Link>}
        {hasTalaoAccess && <Link href="/workspace">Voltar ao workspace</Link>}
        {!isInternal && <Link href="/pedidos">Meus pedidos</Link>}
        {!isInternal && <button className={publicUi.topnavCart} onClick={openCart} aria-label="Carrinho">
          <ShoppingBag className="size-5" aria-hidden="true" />
          <span className={publicUi.count}>{cartCount}</span>
        </button>}
        {authUser && <NotificationCenter />}
        {hasTalaoAccess && <TalaoButton />}
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
  // Mesmo bypass do proxy.ts: vendedora sempre opera o talão; administradora
  // só quando tem adminAccess (ver isAdministrator no backend).
  const hasTalaoAccess = authUser?.role === 'vendedora' || authUser?.permissions?.adminAccess === true;
  const isCliente = authUser?.role === 'cliente';
  const body = (
    <AuthProvider authUser={authUser} publicCatalogPrices={publicCatalogPrices}>
      <QuickViewProvider>
        <CartProvider>
          <LayoutGroup id="product-detail">
            <div className="flex min-h-screen flex-col">
              <TopNav categoryTree={categoryTree} authUser={authUser} />
              <div className="flex-1">{children}</div>
              <CatalogFooter authUser={authUser} />
            </div>
            <CartDrawer />
            {hasTalaoAccess && <TalaoDrawer />}
            {isCliente && <PresenceBadge />}
            {hasTalaoAccess && <TalaoPresenceBadge />}
            <GlobalQuickView />
          </LayoutGroup>
        </CartProvider>
      </QuickViewProvider>
    </AuthProvider>
  );

  if (hasTalaoAccess) return <TalaoProvider>{body}</TalaoProvider>;
  if (isCliente) return <ClientSessionProvider>{body}</ClientSessionProvider>;
  return body;
}
