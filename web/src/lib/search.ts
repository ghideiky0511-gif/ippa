// Sugestão de busca por prefixo do nome. A ordem de hoje é a do catálogo
// (arbitrária); fica pronta pra virar ranking por popularidade/analytics
// depois sem mudar quem consome isso (mesmo padrão de featuredProductIds e
// shipping.js).

import type { Product } from './types';

export function getSearchSuggestions(products: Product[], query: string, limit = 3): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return products.filter((p) => (p.name || '').toLowerCase().startsWith(q)).slice(0, limit);
}
