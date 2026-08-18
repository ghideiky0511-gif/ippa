'use client';
import { publicUi } from '@/lib/ui';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Volta pra onde a pessoa estava (ex.: /frete, /pagamento — ver os gates
  // de login em cada um) em vez do destino padrão por role, quando veio de
  // lá. Sem redirect= (entrar direto pela página de login), comportamento
  // de sempre.
  const redirect = searchParams.get('redirect');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Não foi possível entrar.');
        return;
      }
      router.push(redirect || (data.user.role === 'vendedora' ? '/catalogo' : '/'));
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={publicUi.loginPage}>
      <form className={publicUi.loginForm} onSubmit={handleSubmit}>
        <h1>Entrar</h1>
        <div className={publicUi.field}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        </div>
        <div className={publicUi.field}>
          <label>Senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className={publicUi.error}>{error}</p>}
        <button className={publicUi.primaryButton} type="submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <p className={publicUi.authSwitch}>
          Não tem conta?{' '}
          <Link href={redirect ? `/cadastro?redirect=${encodeURIComponent(redirect)}` : '/cadastro'}>Cadastre-se</Link>
        </p>
      </form>
    </div>
  );
}
