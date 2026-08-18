const API_BASE = typeof window === 'undefined' ? (process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001') : '';

/** @returns {Promise<import('./homeSectionTypes').Product[]>} */
export async function fetchCatalog() {
  const res = await fetch(`${API_BASE}/api/catalog`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível carregar os produtos do catálogo.');
  return res.json();
}
