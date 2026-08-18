'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

// Login da plataforma admin — antes disso não existia nenhum. Só entra
// quem tem permissions.adminAccess (ver POST /api/admin/auth/login em
// `web`, checado lá); esta tela só chama o proxy local
// (api/auth/login/route.js), que seta a cookie própria do admin.
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin-session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Não foi possível entrar.');
        return;
      }
      router.push('/admin');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-background p-5">
      <form className="flex w-full max-w-[340px] flex-col gap-3.5 rounded-brand bg-brand-card p-7 shadow-[0_1px_4px_rgba(0,0,0,0.08)]" onSubmit={handleSubmit}>
        <h1>Entrar</h1>
        <p className="text-[13px] text-brand-muted">Acesso restrito à plataforma admin.</p>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-brand-muted">E-mail</label>
          <input className="rounded-lg border border-[#ddd] bg-white px-3 py-2.5 text-sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-brand-muted">Senha</label>
          <input className="rounded-lg border border-[#ddd] bg-white px-3 py-2.5 text-sm" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-[13px] text-[#c0392b]">{error}</p>}
        <button className="cursor-pointer rounded-lg border-0 bg-brand-primary px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-brand-primary-dark disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
