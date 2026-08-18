import { API_BASE } from '@/lib/api-config';

export async function fetchUsers() {
  const res = await fetch(`${API_BASE}/api/admin/users`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível carregar os usuários.');
  return res.json();
}

export async function createVendedora({ name, email, password, catalogAreas }) {
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, catalogAreas }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível criar o acesso.');
  return data;
}

// Edita o LOGIN (nome/e-mail de acesso/senha) e, pra vendedora, as áreas
// do catálogo liberadas — vale pra vendedora e cliente (cliente não manda
// catalogAreas, ver UserFormModal.js). `password` vazio/omitido mantém a
// senha atual.
export async function updateUser(id, { name, email, password, catalogAreas }) {
  const res = await fetch(`${API_BASE}/api/admin/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password: password || undefined, catalogAreas }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível salvar as alterações.');
  return data;
}

export async function deleteUser(id) {
  const res = await fetch(`${API_BASE}/api/admin/users/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível excluir o usuário.');
  return data;
}

// Cria um cadastro de cliente completo (cadastro + login) direto pelo
// admin — campos do formulário: name/email/password (login) +
// clientEmail/cpfCnpj/cep/endereço/companyResponsible/storeName (cadastro).
export async function createCliente(fields) {
  const res = await fetch(`${API_BASE}/api/admin/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível criar a cliente.');
  return data;
}

// Edita o CADASTRO (Client) — CPF/CNPJ, e-mail de contato, endereço,
// responsável/nome da loja. Não mexe no login (ver updateUser acima).
export async function updateClient(clientId, fields) {
  const res = await fetch(`${API_BASE}/api/admin/clients/${clientId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível salvar o cadastro.');
  return data;
}
