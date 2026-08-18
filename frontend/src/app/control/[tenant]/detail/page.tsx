'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ControlTenant, ControlTenantUser, TenantStatus } from '@/lib/control/types';

export default function TenantDetailPage({ params }: { params: Promise<{ tenant: string }> }) {
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenant, setTenant] = useState<ControlTenant | null>(null);
  const [users, setUsers] = useState<ControlTenantUser[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  return <main className="mx-auto max-w-5xl p-6">
    <Link href="/control" className="mb-6 inline-block text-sm underline">Voltar para tenants</Link>
    {loading ? <p className="text-sm text-brand-muted">Carregando...</p> : error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : tenant && <>
      <header className="mb-7"><h1 className="text-2xl font-semibold">{tenant.name}</h1><p className="text-sm text-brand-muted">/{tenantSlug}</p></header>
      <section className="mb-6 rounded-brand bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-semibold">Situacao do tenant</h2><p className="mb-4 text-sm text-brand-muted">Status atual: {tenant.status}</p><div className="flex flex-wrap gap-2"><button className="rounded border px-3 py-1.5 text-sm" onClick={() => updateStatus('active')}>Ativar</button><button className="rounded border px-3 py-1.5 text-sm" onClick={() => updateStatus('inactive')}>Inativar</button><button className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700" onClick={() => updateStatus('archived')}>Arquivar</button></div></section>
      <section className="mb-6 rounded-brand bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-semibold">Plano e contrato</h2>{tenant.contract ? <div className="text-sm"><p>{tenant.contract.plan.name} ({tenant.contract.plan.code})</p><p className="text-brand-muted">{tenant.contract.status} - {tenant.contract.billingCycle}</p></div> : <p className="text-sm text-brand-muted">Sem plano ou contrato definido.</p>}</section>
      <section className="rounded-brand bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-semibold">Usuarios atuais</h2>{users.length === 0 ? <p className="text-sm text-brand-muted">Nenhum usuario.</p> : <ul className="space-y-2 text-sm">{users.map((user) => <li key={user.id} className="rounded-lg bg-brand-background p-3"><p className="font-medium">{user.name}</p><p className="text-brand-muted">{user.email} - {user.role} - {user.active ? 'ativo' : 'inativo'}</p></li>)}</ul>}</section>
    </>}
  </main>;
}
