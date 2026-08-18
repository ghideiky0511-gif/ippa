'use client';
import { publicUi } from '@/lib/ui';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from '@/components/TenantLink';
import { useRouter, useSearchParams } from 'next/navigation';
import { getDocumentType } from '@/lib/document';
import { CART_KEY } from '@/components/CartProvider';
import type { CartItem } from '@/domain/orders/types';
import { useTenant } from '@/components/TenantProvider';

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
  // Lido direto do localStorage (não via useCart()) porque /cadastro fica
  // fora do AppShell — ver CART_KEY em CartProvider.tsx.
  const [anonymousCart, setAnonymousCart] = useState<CartItem[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_KEY);
      if (raw) setAnonymousCart(JSON.parse(raw));
    } catch {
      /* localStorage indisponível/corrompido — segue sem carrinho anônimo */
    }
  }, []);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          cpfCnpj,
          companyResponsible,
          storeName,
          cep,
          street,
          number,
          complement,
          neighborhood,
          city,
          state,
          // Carrinho anônimo (localStorage) montado antes de criar conta —
          // se o gatilho de fila atribuir uma vendedora e criar um talão
          // novo (ver POST /api/auth/signup), ele nasce com esses itens em
          // vez de vazio, pra não "sumir" o carrinho bem na hora em que a
          // pessoa é obrigada a logar pra continuar (ver gate de login em
          // /frete e /pagamento).
          cart: anonymousCart,
        }),
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
          <label>CPF/CNPJ</label>
          <input type="text" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} required />
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
        <button className={publicUi.primaryButton} type="submit" disabled={loading}>
          {loading ? 'Criando conta…' : 'Criar conta'}
        </button>
        <p className={publicUi.authSwitch}>
          Já tem conta?{' '}
          <Link href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'}>Entrar</Link>
        </p>
      </form>
    </div>
  );
}
