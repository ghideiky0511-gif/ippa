'use client';

import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import TenantLink from '@/components/TenantLink';
import { useTenant } from './TenantProvider';
import { useQuickView } from './QuickViewProvider';
import { clearCatalogScrollPosition, saveCatalogScrollPosition } from '@/lib/catalog-scroll';

type ProductPageLinkProps = Omit<ComponentProps<'a'>, 'href' | 'onClick'> & {
  children: ReactNode;
  productId: string;
};

/**
 * Inicia a troca de superfície sem desmontar o painel de origem. Assim o
 * Motion consegue medir os dois detalhes e conectar seus layouts.
 */
export default function ProductPageLink({ productId, children, target, ...props }: ProductPageLinkProps) {
  const router = useRouter();
  const { href } = useTenant();
  const { startProductPageTransition } = useQuickView();
  const productHref = href(`/produto/${productId}`);
  const catalogHref = href('/catalogo');

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const opensNewContext = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || target === '_blank';
    if (event.defaultPrevented || event.button !== 0 || opensNewContext) return;

    event.preventDefault();
    if (window.location.pathname.replace(/\/+$/, '') === catalogHref.replace(/\/+$/, '')) {
      saveCatalogScrollPosition(catalogHref);
    } else {
      clearCatalogScrollPosition();
    }
    startProductPageTransition(productId);
    router.push(productHref);
  }

  return (
    <TenantLink href={productHref} target={target} onClick={handleClick} {...props}>
      {children}
    </TenantLink>
  );
}
