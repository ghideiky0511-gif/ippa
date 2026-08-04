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
//
// O feed tem categorias "soltas" que na prática são uma variação de outra
// (ex.: "BODY ALCA" é só um recorte de "BODY"). Quando o nome de uma
// categoria começa com o nome de outra categoria existente + espaço, ela
// deixa de ser um item próprio no menu e vira mais uma subcategoria dela —
// isso é o que resume BODY/BODY ALCA e SHORTS/SHORTS SAIA num item só.
export function getCategoryTree(products) {
  const map = new Map();
  for (const p of products) {
    if (!p.category) continue;
    if (!map.has(p.category)) map.set(p.category, new Set());
    if (p.subcategory) map.get(p.category).add(p.subcategory);
  }

  const categoryNames = Array.from(map.keys());
  for (const name of categoryNames) {
    const base = categoryNames.find((other) => other !== name && name.startsWith(other + ' '));
    if (!base) continue;
    const folded = map.get(name);
    folded.add(name);
    for (const sub of folded) map.get(base).add(sub);
    map.delete(name);
  }

  return Array.from(map.entries())
    .map(([category, subs]) => ({ category, subcategories: Array.from(subs).sort() }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

// Resolve uma lista de IDs pra produtos, preservando a ordem da lista e
// ignorando IDs que não existem mais. `ids` null/undefined é a convenção
// pra "sem filtro" — retorna o catálogo inteiro (usado por públicos/tags
// que ainda não têm uma lista própria definida).
export function getProductsByIds(products, ids) {
  if (!ids) return products;
  const byId = new Map(products.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export function getFeaturedProducts(products, featuredIds) {
  return getProductsByIds(products, featuredIds || []);
}
