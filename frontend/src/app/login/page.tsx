'use client';
import { publicUi } from '@/lib/ui';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getDocumentType } from '@/lib/document';
import { apiFetch } from '@/lib/api-client';
import { useTenant } from '@/components/TenantProvider';
import { useStoreSettings } from '@/components/StoreSettingsProvider';

type AccessStage = 'document' | 'login' | 'first_access' | 'confirmation_sent';

export default function LoginPage() {
  const router = useRouter();
  const { href } = useTenant();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const storeSettings = useStoreSettings();
  const allowCpfSignup = storeSettings.features?.allowCpfSignup !== false;
  const [stage, setStage] = useState<AccessStage>('document');
  const [document, setDocument] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function readError(response: Response, fallback: string): Promise<string> {
    const data = await response.json().catch(() => ({}));
    return data.error || fallback;
  }

  async function startAccess(event: FormEvent) {
    event.preventDefault();
    if (allowCpfSignup === false && getDocumentType(document) !== 'cnpj') {
      setError('Informe um CNPJ com 14 dígitos.');
      return;
    }
    if (allowCpfSignup === true && !getDocumentType(document)) {
      setError('Informe um CPF ou CNPJ válido.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/auth/document-access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document }),
      });
      if (!response.ok) { setError(await readError(response, 'Não foi possível validar o documento.')); return; }
      const data = await response.json() as { state: 'login' | 'first_access' | 'signup' };
      if (data.state === 'signup') {
        const params = new URLSearchParams({ document });
        if (redirect) params.set('redirect', redirect);
        router.push(href(`/cadastro?${params.toString()}`));
        return;
      }
      setPassword('');
      setPasswordConfirmation('');
      setStage(data.state);
    } finally {
      setLoading(false);
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (stage === 'first_access' && password !== passwordConfirmation) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const endpoint = stage === 'first_access' ? '/api/auth/first-access' : '/api/auth/login';
      const response = await apiFetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document, password }),
      });
      if (!response.ok) { setError(await readError(response, 'Não foi possível continuar.')); return; }
      if (stage === 'first_access') {
        setStage('confirmation_sent');
        return;
      }
      const data = await response.json() as { user: { role: string } };
      router.push(href(redirect || (data.user.role === 'vendedora' ? '/catalogo' : '/')));
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function changeDocument() {
    setStage('document');
    setPassword('');
    setPasswordConfirmation('');
    setError('');
  }

  const documentLabel = allowCpfSignup ? 'Informe seu CPF ou CNPJ' : 'Informe seu CNPJ';

  return (
    <div className={publicUi.loginPage}>
      <section className={publicUi.loginForm} aria-busy={loading}>
        <h1 className="m-0 text-center text-xl font-bold text-[#222]">Entre para comprar</h1>
        <p className="m-0 text-center text-sm leading-5 text-brand-muted">Veja os preços exclusivos para revendedoras.</p>

        {stage === 'document' ? (
          <form className="flex flex-col gap-4" onSubmit={startAccess}>
            <div className={publicUi.field}>
              <label>{documentLabel}</label>
              <input type="text" inputMode="numeric" value={document} onChange={(event) => setDocument(event.target.value)} placeholder={allowCpfSignup ? 'CPF ou CNPJ' : 'CNPJ'} autoFocus required />
            </div>
            {error && <p className={publicUi.error}>{error}</p>}
            <button className={`${publicUi.primaryButton} w-full`} type="submit" disabled={loading}>{loading ? 'Verificando…' : 'Continuar'}</button>
          </form>
        ) : stage === 'confirmation_sent' ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="m-0 text-sm leading-6 text-brand-muted">Enviamos um link de confirmação para o e-mail cadastrado. Abra-o para ativar a conta e entrar.</p>
            <button className={`${publicUi.subtleButton} w-full`} type="button" onClick={changeDocument}>Usar outro CPF/CNPJ</button>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submitPassword}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-brand-muted">{document}</span>
              <button className="text-sm font-semibold text-brand-primary hover:underline" type="button" onClick={changeDocument}>Alterar</button>
            </div>
            <p className="m-0 text-sm leading-5 text-brand-muted">
              {stage === 'first_access' ? 'Este é seu primeiro acesso. Crie uma senha para continuar.' : 'Informe sua senha para entrar.'}
            </p>
            <div className={publicUi.field}>
              <label>Senha</label>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required minLength={6} />
            </div>
            {stage === 'first_access' && <div className={publicUi.field}>
              <label>Confirme sua senha</label>
              <input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required minLength={6} />
            </div>}
            {error && <p className={publicUi.error}>{error}</p>}
            <button className={`${publicUi.primaryButton} w-full`} type="submit" disabled={loading}>
              {loading ? 'Aguarde…' : stage === 'first_access' ? 'Enviar confirmação por e-mail' : 'Entrar'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
