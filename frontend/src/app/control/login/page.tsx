'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function ControlLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/control-session/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return setError(payload.error || 'Não foi possível entrar.');
      router.replace('/control');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <form className="flex w-full max-w-sm flex-col gap-4 rounded-brand bg-white p-7 shadow" onSubmit={submit}>
        <div><h1 className="text-xl font-semibold">Control IPPA</h1><p className="mt-1 text-sm text-brand-muted">Acesso restrito à plataforma.</p></div>
        <input className="rounded-lg border p-2.5" type="email" placeholder="E-mail" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
        <input className="rounded-lg border p-2.5" type="password" placeholder="Senha" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="rounded-lg bg-brand-primary p-2.5 font-semibold text-white disabled:opacity-60" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  );
}
