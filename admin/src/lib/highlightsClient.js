const API_BASE = process.env.NEXT_PUBLIC_CATALOG_ORIGIN || 'http://localhost:3000';

export async function fetchHighlights() {
  const res = await fetch(`${API_BASE}/api/highlights`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível carregar as coleções.');
  return res.json();
}

export async function saveHighlights(highlights) {
  const res = await fetch(`${API_BASE}/api/highlights`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(highlights),
  });
  if (!res.ok) throw new Error('Não foi possível salvar — confira os dados e tente de novo.');
  return res.json();
}
