'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CartProvider, useCart } from './CartProvider';
import { TalaoProvider, useTalao } from './TalaoProvider';
import CartDrawer from './CartDrawer';
import TalaoDrawer from './TalaoDrawer';
import SideMenu from './SideMenu';
import { CONFIG } from '@/lib/config';
import type { AuthUser, CategoryTreeEntry } from '@/lib/types';

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
  const isVendedora = authUser?.role === 'vendedora';

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
        <Link href="/catalogo">Catálogo</Link>
        {!isVendedora && <Link href="/pedidos">Meus pedidos</Link>}
        {isVendedora ? (
          <>
            <TalaoButton />
            <button className="topnav-login-link" onClick={handleLogout}>Sair</button>
          </>
        ) : (
          <>
            <button className="topnav-cart" onClick={openCart}>
              🛍 <span className="count">{cartCount}</span>
            </button>
            <Link href="/login" className="topnav-login-link">Entrar</Link>
          </>
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
    <CartProvider>
      <TopNav categoryTree={categoryTree} authUser={authUser} />
      {children}
      <CartDrawer />
      {isVendedora && <TalaoDrawer />}
    </CartProvider>
  );

  return isVendedora ? <TalaoProvider>{body}</TalaoProvider> : body;
}
