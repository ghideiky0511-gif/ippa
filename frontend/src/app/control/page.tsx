'use client';

import { useEffect, useState, type FormEvent } from 'react';

type TenantStatus = 'active' | 'inactive' | 'archived';
type Tenant = { id: string; slug: string; name: string; status: TenantStatus; active: boolean; createdAt: string };

const emptyForm = { name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '' };

export default function ControlPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch('/api/control-session/tenants', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.error || 'Não foi possível carregar os tenants.');
    setTenants(payload.tenants || []);
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/control-session/tenants', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return setError(payload.error || 'Não foi possível criar o tenant.');
      setForm(emptyForm); await load();
    } finally { setSaving(false); }
  }

  async function updateStatus(id: string, status: TenantStatus) {
    setError('');
    const response = await fetch(`/api/control-session/tenants/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.error || 'Não foi possível alterar o tenant.');
    setTenants((current) => current.map((tenant) => tenant.id === id ? payload.tenant : tenant));
  }

  async function logout() { await fetch('/api/control-session/auth/logout', { method: 'POST' }); window.location.assign('/control/login'); }
  const field = (key: keyof typeof form, placeholder: string, type = 'text') => <input className="rounded-lg border p-2" type={type} placeholder={placeholder} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required />;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-7 flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Control IPPA</h1><p className="text-sm text-brand-muted">Gestão de tenants da plataforma.</p></div><button className="text-sm underline" onClick={logout}>Sair</button></header>
      <section className="mb-7 rounded-brand bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold">Criar tenant</h2><form className="grid gap-3 md:grid-cols-2" onSubmit={create}>
        {field('name', 'Nome da loja')}{field('slug', 'slug-da-loja')}{field('adminName', 'Nome do administrador')}{field('adminEmail', 'E-mail do administrador', 'email')}{field('adminPassword', 'Senha inicial (mínimo 12 caracteres)', 'password')}
        <button className="rounded-lg bg-brand-primary px-4 py-2 font-semibold text-white disabled:opacity-60 md:col-span-2" disabled={saving}>{saving ? 'Criando…' : 'Criar tenant'}</button>
      </form></section>
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <section className="overflow-hidden rounded-brand bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-lg font-semibold">Tenants</h2></div>
        {loading ? <p className="p-5 text-sm text-brand-muted">Carregando…</p> : <div className="divide-y">{tenants.map((tenant) => <article className="flex flex-wrap items-center justify-between gap-3 p-5" key={tenant.id}>
          <div><p className="font-medium">{tenant.name}</p><p className="text-sm text-brand-muted">/{tenant.slug} · {tenant.status}</p></div>
          <div className="flex gap-2"><button className="rounded border px-3 py-1.5 text-sm" onClick={() => updateStatus(tenant.id, 'active')}>Ativar</button><button className="rounded border px-3 py-1.5 text-sm" onClick={() => updateStatus(tenant.id, 'inactive')}>Inativar</button><button className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700" onClick={() => updateStatus(tenant.id, 'archived')}>Arquivar</button></div>
        </article>)}</div>}
      </section>
    </main>
  );
}
