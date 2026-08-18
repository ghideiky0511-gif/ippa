import { API_BASE } from '@/lib/api-config';

export async function fetchDiscounts() {
  const res = await fetch(`${API_BASE}/api/discounts`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível carregar os descontos.');
  return res.json();
}

export async function saveDiscounts(discounts) {
  const res = await fetch(`${API_BASE}/api/discounts`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discounts),
  });
  if (!res.ok) throw new Error('Não foi possível salvar — confira os dados e tente de novo.');
  return res.json();
}
