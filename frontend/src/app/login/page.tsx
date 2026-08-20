'use client';
import { publicUi } from '@/lib/ui';

import { useEffect, useState, type FormEvent } from 'react';
import Link from '@/components/TenantLink';
import { useRouter, useSearchParams } from 'next/navigation';
import { getDocumentType } from '@/lib/document';
import { useTenant } from '@/components/TenantProvider';

type LoginMethod = 'document' | 'email';

export default function LoginPage() {
  const router = useRouter();
  const { href } = useTenant();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const [allowCpfSignup, setAllowCpfSignup] = useState<boolean | null>(null);
  const [method, setMethod] = useState<LoginMethod>('document');
  const [document, setDocument] = useState('');
  const [documentReady, setDocumentReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // A mesma fonte de verdade usada no cadastro decide o documento exibido no
  // login. Enquanto ela carrega, o formulário não aceita uma opção inválida.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/store-settings')
      .then((response) => (response.ok ? response.json() : null))
      .then((settings) => {
        if (!cancelled) setAllowCpfSignup(settings?.features?.allowCpfSignup !== false);
      })
      .catch(() => {
        if (!cancelled) setAllowCpfSignup(true);
      });
    return () => { cancelled = true; };
  }, []);

  function startDocumentLogin(event: FormEvent) {
    event.preventDefault();
    if (allowCpfSignup === false && getDocumentType(document) !== 'cnpj') {
      setError('Informe um CNPJ com 14 dígitos.');
      return;
    }
    if (allowCpfSignup === true && !getDocumentType(document)) {
      setError('Informe um CPF ou CNPJ válido.');
      return;
    }
    setError('');
    setDocumentReady(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const body = method === 'document' ? { document, password } : { email, password };
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Não foi possível entrar.');
        return;
      }
      router.push(href(redirect || (data.user.role === 'vendedora' ? '/catalogo' : '/')));
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function switchMethod(nextMethod: LoginMethod) {
    setMethod(nextMethod);
    setDocumentReady(false);
    setPassword('');
    setError('');
  }

  const cadastroHref = redirect ? `/cadastro?redirect=${encodeURIComponent(redirect)}` : '/cadastro';

  return (
    <div className={publicUi.loginPage}>
      <section className={publicUi.loginForm} aria-busy={allowCpfSignup === null}>
        <h1 className="m-0 text-center text-xl font-bold text-[#222]">Entre para comprar</h1>
        <p className="m-0 text-center text-sm leading-5 text-brand-muted">
          Veja os preços exclusivos para revendedoras.
        </p>

        {allowCpfSignup === null ? <p className="m-0 text-center text-sm text-brand-muted">Carregando opções de acesso…</p> : (
          method === 'document' && !documentReady ? (
            <form className="flex flex-col gap-4" onSubmit={startDocumentLogin}>
              <div className={publicUi.field}>
                <label>{allowCpfSignup ? 'Informe seu CPF ou CNPJ' : 'Informe seu CNPJ'}</label>
                <input type="text" inputMode="numeric" value={document} onChange={(event) => setDocument(event.target.value)} placeholder={allowCpfSignup ? 'CPF ou CNPJ' : 'CNPJ'} autoFocus required />
              </div>
              {error && <p className={publicUi.error}>{error}</p>}
              <button className={`${publicUi.primaryButton} w-full`} type="submit">Continuar</button>
              <button className={`${publicUi.subtleButton} w-full`} type="button" onClick={() => switchMethod('email')}>Entrar com e-mail</button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              {method === 'document' ? <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-brand-muted">{document}</span>
                  <button className="text-sm font-semibold text-brand-primary hover:underline" type="button" onClick={() => setDocumentReady(false)}>Alterar</button>
                </div>
                <div className={publicUi.field}>
                  <label>Senha</label>
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required />
                </div>
              </> : <>
                <div className={publicUi.field}>
                  <label>E-mail</label>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus required />
                </div>
                <div className={publicUi.field}>
                  <label>Senha</label>
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                </div>
              </>}
              {error && <p className={publicUi.error}>{error}</p>}
              <button className={`${publicUi.primaryButton} w-full`} type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
              <button className={`${publicUi.subtleButton} w-full`} type="button" onClick={() => switchMethod(method === 'document' ? 'email' : 'document')}>
                {method === 'document' ? 'Entrar com e-mail' : allowCpfSignup ? 'Entrar com CPF/CNPJ' : 'Entrar com CNPJ'}
              </button>
            </form>
          )
        )}

        <p className={publicUi.authSwitch}>Não tem conta? <Link href={cadastroHref}>Cadastre-se</Link></p>
      </section>
    </div>
  );
}
