const API_BASE = typeof window === 'undefined' ? (process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001') : '';

export async function fetchSimilarProductsSettings() {
  const res = await fetch(`${API_BASE}/api/similar-products-settings`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível carregar a configuração de produtos similares.');
  return res.json();
}

export async function saveSimilarProductsSettings(settings) {
  const res = await fetch(`${API_BASE}/api/similar-products-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Não foi possível salvar — confira os dados e tente de novo.');
  return res.json();
}
