'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import type { ControlTenant, ControlTenantUser, TenantStatus } from '@/lib/control/types';

const emptyAdminForm = { name: '', email: '', password: '' };

export default function TenantDetailPage({ params }: { params: Promise<{ tenant: string }> }) {
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenant, setTenant] = useState<ControlTenant | null>(null);
  const [users, setUsers] = useState<ControlTenantUser[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState(emptyAdminForm);
  const [adminError, setAdminError] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState('');

  useEffect(() => {
    async function load() {
      const { tenant: routeTenant } = await params;
      setTenantSlug(routeTenant);
      const tenantsResponse = await fetch('/api/control-session/tenants', { cache: 'no-store' });
      const tenantsPayload = await tenantsResponse.json().catch(() => ({}));
      if (!tenantsResponse.ok) { setError(tenantsPayload.error || 'Nao foi possivel carregar o tenant.'); return; }
      const found = (tenantsPayload.tenants || []).find((item: ControlTenant) => item.slug === routeTenant);
      if (!found) { setError('Tenant nao encontrado.'); return; }
      setTenant(found);

      const usersResponse = await fetch(`/api/control-session/tenants/${found.id}`, { cache: 'no-store' });
      const usersPayload = await usersResponse.json().catch(() => ({}));
      if (!usersResponse.ok) { setError(usersPayload.error || 'Nao foi possivel carregar os usuarios.'); return; }
      setUsers(usersPayload.users || []);
    }
    load().finally(() => setLoading(false));
  }, [params]);

  async function updateStatus(status: TenantStatus) {
    if (!tenant) return;
    setError('');
    const response = await fetch(`/api/control-session/tenants/${tenant.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.error || 'Nao foi possivel alterar o tenant.');
    setTenant((current) => current ? { ...current, ...payload.tenant, userCount: current.userCount, contract: current.contract } : current);
  }

  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenant) return;
    setCreatingAdmin(true); setAdminError('');
    try {
      const response = await fetch(`/api/control-session/tenants/${tenant.id}/users`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(adminForm) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return setAdminError(payload.error || 'Nao foi possivel criar o administrador.');
      setUsers((current) => [...current, payload.user]);
      setAdminForm(emptyAdminForm); setShowCreateAdmin(false);
    } finally { setCreatingAdmin(false); }
  }

  async function deleteUser(user: ControlTenantUser) {
    if (!tenant) return;
    if (!window.confirm(`Excluir o usuario ${user.name}?`)) return;
    setDeletingUserId(user.id); setAdminError('');
    try {
      const response = await fetch(`/api/control-session/tenants/${tenant.id}/users/${user.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        return setAdminError(payload.error || 'Nao foi possivel excluir o usuario.');
      }
      setUsers((current) => current.filter((item) => item.id !== user.id));
    } finally { setDeletingUserId(''); }
  }

  return <main className="mx-auto max-w-5xl p-6">
    <Link href="/control" className="mb-6 inline-block text-sm underline">Voltar para tenants</Link>
    {loading ? <p className="text-sm text-brand-muted">Carregando...</p> : error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : tenant && <>
      <header className="mb-7"><h1 className="text-2xl font-semibold">{tenant.name}</h1><p className="text-sm text-brand-muted">/{tenantSlug}</p></header>
      <section className="mb-6 rounded-brand bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-semibold">Situacao do tenant</h2><p className="mb-4 text-sm text-brand-muted">Status atual: {tenant.status}</p><div className="flex flex-wrap gap-2"><button className="rounded border px-3 py-1.5 text-sm" onClick={() => updateStatus('active')}>Ativar</button><button className="rounded border px-3 py-1.5 text-sm" onClick={() => updateStatus('inactive')}>Inativar</button><button className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700" onClick={() => updateStatus('archived')}>Arquivar</button></div></section>
      <section className="mb-6 rounded-brand bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-semibold">Plano e contrato</h2>{tenant.contract ? <div className="text-sm"><p>{tenant.contract.plan.name} ({tenant.contract.plan.code})</p><p className="text-brand-muted">{tenant.contract.status} - {tenant.contract.billingCycle}</p></div> : <p className="text-sm text-brand-muted">Sem plano ou contrato definido.</p>}</section>
      <section className="rounded-brand bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Usuarios atuais</h2><button className="rounded border px-3 py-1.5 text-sm" onClick={() => setShowCreateAdmin((current) => !current)}>{showCreateAdmin ? 'Cancelar' : 'Criar administrador'}</button></div>
        {showCreateAdmin && <form className="mb-4 grid gap-3 rounded-lg bg-brand-background p-4 md:grid-cols-3" onSubmit={createAdmin}>
          <input className="rounded-lg border p-2" placeholder="Nome" value={adminForm.name} onChange={(event) => setAdminForm({ ...adminForm, name: event.target.value })} required />
          <input className="rounded-lg border p-2" type="email" placeholder="E-mail" value={adminForm.email} onChange={(event) => setAdminForm({ ...adminForm, email: event.target.value })} required />
          <input className="rounded-lg border p-2" type="password" placeholder="Senha (minimo 12 caracteres)" value={adminForm.password} onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })} required />
          <button className="rounded-lg bg-brand-primary px-4 py-2 font-semibold text-white disabled:opacity-60 md:col-span-3" disabled={creatingAdmin}>{creatingAdmin ? 'Criando...' : 'Criar administrador'}</button>
        </form>}
        {adminError && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{adminError}</p>}
        {users.length === 0 ? <p className="text-sm text-brand-muted">Nenhum usuario.</p> : <ul className="space-y-2 text-sm">{users.map((user) => <li key={user.id} className="flex items-center justify-between gap-3 rounded-lg bg-brand-background p-3"><div><p className="font-medium">{user.name}</p><p className="text-brand-muted">{user.email} - {user.role} - {user.active ? 'ativo' : 'inativo'}</p></div><button className="shrink-0 rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-60" onClick={() => deleteUser(user)} disabled={deletingUserId === user.id}>{deletingUserId === user.id ? 'Excluindo...' : 'Excluir'}</button></li>)}</ul>}
      </section>
    </>}
  </main>;
}
