'use client';
import { publicUi } from '@/lib/ui';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from '@/components/TenantLink';
import { useRouter, useSearchParams } from 'next/navigation';
import { getDocumentType } from '@/lib/document';
import { apiFetch } from '@/lib/api-client';
import { useTenant } from '@/components/TenantProvider';
import { useStoreSettings } from '@/components/StoreSettingsProvider';
import { CustomerSignupSchema } from '@/domain/clients/types';

interface ViaCepResponse {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
}

export default function CadastroPage() {
  const router = useRouter();
  const { href } = useTenant();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const requestedDocument = searchParams.get('document') ?? '';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // O documento já foi validado na porta única /login. Esta etapa coleta
  // apenas os demais dados de uma cliente nova.
  const [cpfCnpj] = useState(requestedDocument);
  const [companyResponsible, setCompanyResponsible] = useState('');
  const [storeName, setStoreName] = useState('');
  const docType = useMemo(() => getDocumentType(cpfCnpj), [cpfCnpj]);
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const storeSettings = useStoreSettings();
  const allowCpfSignup = storeSettings.features?.allowCpfSignup !== false;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (requestedDocument) return;
    const params = new URLSearchParams();
    if (redirect) params.set('redirect', redirect);
    router.replace(href(`/login${params.size ? `?${params.toString()}` : ''}`));
  }, [href, redirect, requestedDocument, router]);

  // Busca automática por CEP (ViaCEP, serviço público sem chave) — dispara
  // só quando o CEP tem 8 dígitos, evitando bater a API a cada tecla.
  // Falha/CEP inexistente é ignorado silenciosamente: os campos continuam
  // editáveis à mão, nada trava o cadastro por causa disso.
  const lastLookedUpRef = useRef('');
  useEffect(() => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8 || digits === lastLookedUpRef.current) return;
    lastLookedUpRef.current = digits;
    let cancelled = false;
    fetch(`https://viacep.com.br/ws/${digits}/json/`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ViaCepResponse | null) => {
        if (cancelled || !data || data.erro) return;
        if (data.logradouro) setStreet(data.logradouro);
        if (data.bairro) setNeighborhood(data.bairro);
        if (data.localidade) setCity(data.localidade);
        if (data.uf) setState(data.uf);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cep]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allowCpfSignup && getDocumentType(cpfCnpj) !== 'cnpj') {
      setError('Informe um CNPJ com 14 dígitos.');
      return;
    }
    const parsed = CustomerSignupSchema.safeParse({
      name, email, password, cpfCnpj, companyResponsible, storeName, cep,
      street, number, complement, neighborhood, city, state,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Revise os dados do cadastro.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Não foi possível criar sua conta.');
        return;
      }
      router.push(href(redirect || '/'));
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={publicUi.loginPage}>
      <form className={publicUi.loginForm} onSubmit={handleSubmit}>
        <h1>Criar conta</h1>
        {!requestedDocument ? (
          <p>Carregando opções de cadastro…</p>
        ) : <>
        <div className={publicUi.field}>
          <label>Nome</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </div>
        <div className={publicUi.field}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className={publicUi.field}>
          <label>Senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        <div className={publicUi.field}>
          <label>{allowCpfSignup ? 'CPF/CNPJ' : 'CNPJ'}</label>
          <input type="text" inputMode="numeric" value={cpfCnpj} placeholder={allowCpfSignup ? 'CPF ou CNPJ' : 'Informe seu CNPJ'} readOnly required />
        </div>
        {docType === 'cnpj' && (
          <div className={publicUi.field}>
            <label>Responsável pela empresa (opcional)</label>
            <input type="text" value={companyResponsible} onChange={(e) => setCompanyResponsible(e.target.value)} />
          </div>
        )}
        {docType === 'cpf' && (
          <div className={publicUi.field}>
            <label>Nome da loja (opcional)</label>
            <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
          </div>
        )}
        <div className={publicUi.field}>
          <label>CEP</label>
          <input type="text" value={cep} onChange={(e) => setCep(e.target.value)} required />
        </div>
        <div className={publicUi.field}>
          <label>Rua</label>
          <input type="text" value={street} onChange={(e) => setStreet(e.target.value)} required />
        </div>
        <div className={publicUi.fieldRow}>
          <div className={publicUi.field}>
            <label>Número</label>
            <input type="text" value={number} onChange={(e) => setNumber(e.target.value)} required />
          </div>
          <div className={publicUi.field}>
            <label>Complemento (opcional)</label>
            <input type="text" value={complement} onChange={(e) => setComplement(e.target.value)} />
          </div>
        </div>
        <div className={publicUi.field}>
          <label>Bairro</label>
          <input type="text" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} required />
        </div>
        <div className={publicUi.fieldRow}>
          <div className={publicUi.field}>
            <label>Cidade</label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} required />
          </div>
          <div className={publicUi.field}>
            <label>Estado</label>
            <input type="text" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} required />
          </div>
        </div>
        {error && <p className={publicUi.error}>{error}</p>}
        <button className={`${publicUi.primaryButton} w-full`} type="submit" disabled={loading}>
          {loading ? 'Criando conta…' : 'Criar conta'}
        </button>
        <p className={publicUi.authSwitch}>
          Já tem conta?{' '}
          <Link href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'}>Entrar</Link>
        </p>
        </>}
      </form>
    </div>
  );
}
