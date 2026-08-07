'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CartProvider, useCart } from './CartProvider';
import { TalaoProvider, useTalao } from './TalaoProvider';
import { QuickViewProvider, useQuickView } from './QuickViewProvider';
import CartDrawer from './CartDrawer';
import TalaoDrawer from './TalaoDrawer';
import ProductQuickView from './ProductQuickView';
import SideMenu from './SideMenu';
import { CONFIG } from '@/lib/config';
import type { AuthUser, CategoryTreeEntry } from '@/lib/types';

// Instância única do quick-view, pra qualquer página poder abrir (clique na
// imagem de um ProductCard, ou "ver mais"/"selecionar" no carrinho — ver
// QuickViewProvider.tsx pra por quê isso é global e não por página.
function GlobalQuickView() {
  const { quickViewProduct, closeQuickView } = useQuickView();
  return <ProductQuickView product={quickViewProduct} onClose={closeQuickView} />;
}

// Ícone do talão no topo, ao lado de onde fica o carrinho pro cliente final
// — mesma ideia, mostra quantos pedidos abertos a vendedora tem no talão.
function TalaoButton() {
  const talao = useTalao();
  if (!talao) return null;
  return (
    <button className="topnav-cart topnav-talao" onClick={talao.openTalao} aria-label="Talão de pedidos">
      📋 <span className="count">{talao.openSessions.length}</span>
    </button>
  );
}

function TopNav({ categoryTree, authUser }: { categoryTree: CategoryTreeEntry[]; authUser: AuthUser | null }) {
  const { cartCount, openCart } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const isVendedora = authUser?.role === 'vendedora';
  // Link "Catálogo" some só nessa própria página (levaria pra onde já
  // está) — nas outras (home, produto, carrinho...) continua útil.
  const onCatalogPage = pathname?.startsWith('/catalogo');

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="topnav">
      <SideMenu categoryTree={categoryTree} />
      <Link href="/" className="topnav-brand">
        {CONFIG.logoUrl ? <img src={CONFIG.logoUrl} alt={CONFIG.storeName} /> : CONFIG.storeName}
      </Link>
      <div className="topnav-links">
        {!onCatalogPage && <Link href="/catalogo">Catálogo</Link>}
        {!isVendedora && <Link href="/pedidos">Meus pedidos</Link>}
        <button className="topnav-cart" onClick={openCart} aria-label="Carrinho">
          🛍 <span className="count">{cartCount}</span>
        </button>
        {isVendedora && <TalaoButton />}
        {isVendedora ? (
          <button className="topnav-login-link" onClick={handleLogout}>Sair</button>
        ) : (
          <Link href="/login" className="topnav-login-link">Entrar</Link>
        )}
      </div>
    </nav>
  );
}

export default function AppShell({
  children,
  categoryTree,
  authUser,
}: {
  children: ReactNode;
  categoryTree: CategoryTreeEntry[];
  authUser: AuthUser | null;
}) {
  const isVendedora = authUser?.role === 'vendedora';

  // CartProvider precisa estar DENTRO do TalaoProvider — é assim que ele
  // consegue enxergar useTalao() e decidir se escreve no carrinho pessoal
  // ou no pedido ativo do talão (ver CartProvider.tsx).
  const body = (
    <QuickViewProvider>
      <CartProvider>
        <TopNav categoryTree={categoryTree} authUser={authUser} />
        {children}
        <CartDrawer />
        {isVendedora && <TalaoDrawer />}
        <GlobalQuickView />
      </CartProvider>
    </QuickViewProvider>
  );

  return isVendedora ? <TalaoProvider>{body}</TalaoProvider> : body;
}
