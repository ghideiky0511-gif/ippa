const API_BASE = process.env.NEXT_PUBLIC_CATALOG_ORIGIN || 'http://localhost:3000';

export async function fetchStoreSettings() {
  const res = await fetch(`${API_BASE}/api/store-settings`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível carregar as configurações da loja.');
  return res.json();
}

export async function saveStoreSettings(settings) {
  const res = await fetch(`${API_BASE}/api/store-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Não foi possível salvar — confira os dados e tente de novo.');
  return res.json();
}
