'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import type { ControlTenant } from '@/lib/control/types';
import { SkeletonList } from '@/components/ui/skeleton';

const emptyForm = { name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '' };

export default function ControlPage() {
  const [tenants, setTenants] = useState<ControlTenant[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    const response = await fetch('/api/control-session/tenants', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.error || 'Nao foi possivel carregar os tenants.');
    setTenants(payload.tenants || []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/control-session/tenants', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return setError(payload.error || 'Nao foi possivel criar o tenant.');
      setForm(emptyForm); setShowCreate(false); await load();
    } finally { setSaving(false); }
  }

  async function logout() { await fetch('/api/control-session/auth/logout', { method: 'POST' }); window.location.assign('/control/login'); }
  const field = (key: keyof typeof form, placeholder: string, type = 'text') => <input className="rounded-lg border p-2" type={type} placeholder={placeholder} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required />;

  return <main className="mx-auto max-w-5xl p-6">
    <header className="mb-7 flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Control IPPA</h1><p className="text-sm text-brand-muted">Gestao de tenants da plataforma.</p></div><button className="text-sm underline" onClick={logout}>Sair</button></header>
    <section className="mb-7 rounded-brand bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Integrações de pagamento</h2><p className="mt-2 text-sm text-brand-muted">Consulte a configuração e o status da conta Stripe da plataforma.</p><Link className="mt-4 inline-block rounded border px-3 py-1.5 text-sm" href="/control/payments/stripe">Abrir Stripe</Link></section>
    <div className="mb-5 flex justify-end"><button className="rounded-lg bg-brand-primary px-4 py-2 font-semibold text-white" onClick={() => setShowCreate((current) => !current)}>{showCreate ? 'Cancelar' : 'Criar tenant'}</button></div>
    {showCreate && <section className="mb-7 rounded-brand bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold">Novo tenant</h2><form className="grid gap-3 md:grid-cols-2" onSubmit={create}>
      {field('name', 'Nome da loja')}{field('slug', 'slug-da-loja')}{field('adminName', 'Nome do administrador')}{field('adminEmail', 'E-mail do administrador', 'email')}{field('adminPassword', 'Senha inicial (minimo 12 caracteres)', 'password')}
      <button className="rounded-lg bg-brand-primary px-4 py-2 font-semibold text-white disabled:opacity-60 md:col-span-2" disabled={saving}>{saving ? 'Criando...' : 'Criar tenant'}</button>
    </form></section>}
    {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="overflow-hidden rounded-brand bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-lg font-semibold">Tenants</h2></div>
      {loading ? <div className="p-5"><SkeletonList count={4} itemClassName="h-16" /></div> : <div className="divide-y">{tenants.map((tenant) => <article className="flex flex-wrap items-center justify-between gap-3 p-5" key={tenant.id}>
        <div><p className="font-medium">{tenant.name}</p><p className="text-sm text-brand-muted">/{tenant.slug} - {tenant.status} - {tenant.userCount} usuario(s)</p><p className="mt-1 text-sm text-brand-muted">{tenant.contract ? `${tenant.contract.plan.name} - ${tenant.contract.status}` : 'Sem plano ou contrato definido'}</p></div>
        <Link className="rounded border px-3 py-1.5 text-sm" href={`/control/${encodeURIComponent(tenant.slug)}/detail`}>Abrir tenant</Link>
      </article>)}</div>}
    </section>
  </main>;
}
