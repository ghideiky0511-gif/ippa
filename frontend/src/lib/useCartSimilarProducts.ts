'use client';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { ProductSchema, type Product } from '@/domain/products/types';
import type { CartItem } from '@/domain/orders/types';

const SimilarProductsResultSchema = z.object({ products: z.array(ProductSchema) });

// Sugestões da regra "carrinho" (ver backend similarProductsService.ts): âncoras
// são os produtos já resolvidos (qty > 0, rascunho não conta) e tudo que está
// no carrinho é excluído, pra só sugerir peças ainda não selecionadas.
export function useCartSimilarProducts(cart: CartItem[], enabled = true): Product[] {
  const [similar, setSimilar] = useState<Product[]>([]);
  const anchorIds = useMemo(() => Array.from(new Set(cart.filter((i) => i.qty > 0).map((i) => i.id))), [cart]);
  const excludeIds = useMemo(() => Array.from(new Set(cart.map((i) => i.id))), [cart]);
  const anchorKey = anchorIds.join(',');

  useEffect(() => {
    if (!enabled || anchorIds.length === 0) {
      // A fileira deve zerar na hora quando o carrinho esvazia ou o painel fecha.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSimilar([]);
      return;
    }
    let cancelled = false;
    fetch('/api/similar-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: 'cart', productIds: anchorIds, excludeIds }),
    })
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((data) => {
        if (cancelled) return;
        const parsed = SimilarProductsResultSchema.safeParse(data);
        setSimilar(parsed.success ? parsed.data.products : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- anchorKey resume anchorIds; SimilarProducts filtra o carrinho em tempo real
  }, [anchorKey, enabled]);

  return similar;
}
