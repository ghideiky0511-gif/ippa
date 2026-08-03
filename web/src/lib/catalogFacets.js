// Facetas derivadas do catálogo (categorias/cores/tamanhos), usadas tanto
// pela home (menu de categorias) quanto pelo catálogo (filtros).

export function getCategories(products) {
  return Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort();
}

export function getColors(products) {
  return Array.from(new Set(products.flatMap((p) => p.colors || []).filter(Boolean))).sort();
}

export function getSizes(products) {
  return Array.from(new Set(products.flatMap((p) => p.sizes || []).filter(Boolean))).sort((a, b) =>
    isNaN(a) || isNaN(b) ? a.localeCompare(b) : Number(a) - Number(b)
  );
}

// Categoria -> subcategorias, pro menu da home (ex.: BODY -> [BODY ALCA, ...]).
export function getCategoryTree(products) {
  const map = new Map();
  for (const p of products) {
    if (!p.category) continue;
    if (!map.has(p.category)) map.set(p.category, new Set());
    if (p.subcategory) map.get(p.category).add(p.subcategory);
  }
  return Array.from(map.entries())
    .map(([category, subs]) => ({ category, subcategories: Array.from(subs).sort() }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function getFeaturedProducts(products, featuredIds) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return (featuredIds || []).map((id) => byId.get(id)).filter(Boolean);
}
