const API_BASE = process.env.NEXT_PUBLIC_CATALOG_ORIGIN || 'http://localhost:3000';

export async function fetchUsers() {
  const res = await fetch(`${API_BASE}/api/admin/users`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível carregar os usuários.');
  return res.json();
}

export async function createVendedora({ name, email, password }) {
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível criar o acesso.');
  return data;
}

export async function deleteUser(id) {
  const res = await fetch(`${API_BASE}/api/admin/users/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível excluir o usuário.');
  return data;
}
