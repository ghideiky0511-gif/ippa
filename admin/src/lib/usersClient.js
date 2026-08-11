const API_BASE = process.env.NEXT_PUBLIC_CATALOG_ORIGIN || 'http://localhost:3000';

export async function fetchUsers() {
  const res = await fetch(`${API_BASE}/api/admin/users`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível carregar os usuários.');
  return res.json();
}
