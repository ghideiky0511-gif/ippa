// @ts-nocheck
import { API_BASE } from '@/lib/api-config';

export async function saveCatalogOrder(order) {
  const res = await fetch(`${API_BASE}/api/catalog-order`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });
  if (!res.ok) throw new Error('Não foi possível salvar — confira os dados e tente de novo.');
  return res.json();
}
