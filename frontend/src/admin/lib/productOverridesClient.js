const API_BASE = typeof window === 'undefined' ? (process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001') : '';

export async function fetchProductOverrides() {
  const res = await fetch(`${API_BASE}/api/product-overrides`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível carregar os ajustes de produto.');
  return res.json();
}

export async function saveProductOverrides(overrides) {
  const res = await fetch(`${API_BASE}/api/product-overrides`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overrides),
  });
  if (!res.ok) throw new Error('Não foi possível salvar — confira os dados e tente de novo.');
  return res.json();
}
