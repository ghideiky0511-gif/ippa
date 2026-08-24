'use client';
import { publicUi } from '@/lib/ui';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, MoreHorizontal, Plus, Search, Share2, X } from 'lucide-react';
import { useTalao } from './TalaoProvider';
import { useCart } from './CartProvider';
import { useTenant } from './TenantProvider';
import { formatBRL } from '@/lib/format';
import { clientSubtext, getDocumentType } from '@/lib/document';
import { isClientComplete } from '@/lib/clientComplete';
import { z } from 'zod';
import { ClientSchema, type Client } from '@/domain/clients/types';
import type { OrderSession } from '@/domain/orders/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import ShareCatalogSheet from './ShareCatalogSheet';
import TenantLink from './TenantLink';

const ClientWithLoginSchema = ClientSchema.extend({ hasLogin: z.boolean().optional() });

function itemCount(session: OrderSession): number {
  return session.items.reduce((sum, i) => sum + i.qty, 0);
}

function subtotal(session: OrderSession): number {
  return session.items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

const CHANNEL_LABELS: Record<OrderSession['channel'], string> = {
  presencial: 'Presencial',
  whatsapp: 'WhatsApp',
  online: 'Online',
};

// GET /api/clients/[id] inclui hasLogin (computado, não é campo de Client)
// — ver hasLoginForClient em web/src/lib/auth.ts.
type ClientWithLogin = Client & { hasLogin?: boolean };

// Cadastro rápido (só Client) sem AuthUser ainda — a vendedora cria o login
// ali mesmo, sem deslogar a própria sessão (ver POST
// /api/clients/[id]/create-login, é uma ação administrativa, não um
// login de verdade neste navegador). Necessário porque useTalaoClientGate.ts
// agora também exige login da cliente antes do frete/pagamento — combinado
// com o usuário: em vez de travar o atendimento, a vendedora resolve na
// hora. E-mail pré-preenchido se o cadastro já tinha um (editável).
function CreateLoginSection({ client, onCreated }: { client: ClientWithLogin; onCreated: () => void }) {
  const [email, setEmail] = useState(client.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}/create-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Não foi possível criar o login.');
        return;
      }
      onCreated();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="contents" onSubmit={handleSubmit}>
      <p className={publicUi.muted}>
        {client.name} ainda não tem login — sem ele não dá pra avançar pro frete. Crie aqui (ela pode entrar com
        esse mesmo e-mail/senha depois, pelo próprio celular).
      </p>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" type="email" required />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Senha (mín. 6 caracteres)"
        type="password"
        minLength={6}
        required
      />
      {error && <p className={publicUi.error}>{error}</p>}
      <button className={publicUi.primaryButton} type="submit" disabled={loading}>
        {loading ? 'Criando…' : 'Criar login pra cliente'}
      </button>
    </form>
  );
}

// Cadastro de cliente vinculado ao pedido ativo — combinado com o usuário:
// a vendedora consegue montar o carrinho livre, sem cadastro nenhum
// (session.clientId fica vazio, só o nome livre em session.clientName);
// vincular um cadastro (CPF/CNPJ, e-mail, CEP) é opcional aqui, mas fica
// obrigatório antes do frete (isClientComplete, web/src/lib/clientComplete.ts,
// aplicada em /frete e /pagamento via useTalaoClientGate.ts) — assim como
// ter login (ver CreateLoginSection acima).
function ClientCadastroSection({ session }: { session: OrderSession }) {
  const talao = useTalao()!;
  const router = useRouter();
  const { href } = useTenant();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [name, setName] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const docType = getDocumentType(cpfCnpj);
  const [companyResponsible, setCompanyResponsible] = useState('');
  const [storeName, setStoreName] = useState('');
  const [email, setEmail] = useState('');
  const [cep, setCep] = useState('');
  // Liga o "flash" do toggle recolhido logo depois de vincular um cadastro
  // (novo ou existente) — fica claro que a ação surtiu efeito, mesmo sem
  // sair da tela do talão. onAnimationEnd desliga sozinho quando a
  // animação termina (ver .talao-cadastro-toggle.just-linked no CSS).
  const [justLinked, setJustLinked] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [linkedClient, setLinkedClient] = useState<ClientWithLogin | null>(null);

  const refetchLinkedClient = useCallback(() => {
    if (!session.clientId) {
      setLinkedClient(null);
      return;
    }
    fetch(`/api/clients/${session.clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const parsed = ClientWithLoginSchema.nullable().safeParse(json);
        setLinkedClient(parsed.success ? parsed.data : null);
      })
      .catch(() => {});
  }, [session.clientId]);

  useEffect(() => {
    const timeout = window.setTimeout(refetchLinkedClient, 0);
    return () => window.clearTimeout(timeout);
  }, [refetchLinkedClient]);

  useEffect(() => {
    const q = query.trim();
    const timeout = window.setTimeout(() => {
      if (!q) {
        setResults([]);
        return;
      }
      fetch(`/api/clients?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setResults)
        .catch(() => {});
    }, q ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [query]);

  // Cliente master (compra por várias filiais de uma vez) — em vez de
  // seguir no drawer, a vendedora vai direto pra página cheia do talão pra
  // montar o atendimento de todo o grupo (decisão combinada com o
  // usuário). Sem filiais, é uma cliente normal, segue no drawer como
  // sempre.
  async function redirectIfMaster(client: Client) {
    try {
      const res = await fetch(`/api/clients?parentId=${encodeURIComponent(client.id)}`);
      const branches = res.ok ? await res.json() : [];
      if (Array.isArray(branches) && branches.length > 0) {
        talao.closeTalao();
        router.push(href(`/workspace/talao?masterId=${client.id}`));
      }
    } catch {
      // Sem confirmação de filiais, segue no drawer normalmente.
    }
  }

  async function handleCreateAndLink(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, cpfCnpj, companyResponsible, storeName, email, cep }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setCreateError(
        res.status === 409
          ? data?.error || 'Já existe cadastro com esse CPF/CNPJ — busque pelo nome ou documento acima pra vincular.'
          : data?.error || 'Não foi possível salvar o cadastro.'
      );
      return;
    }
    const client: Client = await res.json();
    await talao.linkClient(client.id);
    setShowNewForm(false);
    setExpanded(false);
    setJustLinked(true);
    setName('');
    setCpfCnpj('');
    setCompanyResponsible('');
    setStoreName('');
    setEmail('');
    setCep('');
    await redirectIfMaster(client);
  }

  async function handleLinkExisting(client: Client) {
    await talao.linkClient(client.id);
    setQuery('');
    setResults([]);
    setExpanded(false);
    setJustLinked(true);
    await redirectIfMaster(client);
  }

  // Aparece independente do painel estar aberto/fechado — é um pendência
  // que bloqueia o frete (ver useTalaoClientGate.ts), não faz sentido
  // esconder atrás do "editar". Só depois de isClientComplete: um login
  // criado pra um cadastro sem CPF/CNPJ nunca mais aparece pro fluxo de
  // /login por CPF da cliente (findClientRowByDocumentDigits não casa
  // cpf_cnpj nulo), deixando essa conta travada.
  const createLoginSection =
    session.clientId && linkedClient && isClientComplete(linkedClient) && !linkedClient.hasLogin ? (
      <CreateLoginSection client={linkedClient} onCreated={refetchLinkedClient} />
    ) : null;

  if (!expanded) {
    return (
      <>
        <button
          className={`cursor-pointer rounded-lg border border-dashed border-[#ddd] bg-transparent px-2.5 py-2 text-left text-xs text-brand-muted hover:border-brand-primary hover:text-brand-primary ${justLinked ? 'animate-[talao-cadastro-linked_.7s_ease]' : ''}`}
          onClick={() => setExpanded(true)}
          onAnimationEnd={() => setJustLinked(false)}
        >
          {session.clientId ? `Cadastro vinculado: ${session.clientName} (editar)` : 'Vincular cadastro (CPF/CNPJ, e-mail, CEP)'}
        </button>
        {createLoginSection}
      </>
    );
  }

  return (
    <div className="contents">
      <div className={publicUi.field}>
        <label>Buscar cadastro existente</label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome ou CPF/CNPJ" autoFocus />
      </div>

      {results.length > 0 && (
        <div className="contents">
          {results.map((c) => (
            <button key={c.id} className="contents" onClick={() => handleLinkExisting(c)}>
              <span>{c.name}</span>
              <span className={publicUi.talaoChannel}>{c.cpfCnpj || 'sem CPF/CNPJ'}</span>
            </button>
          ))}
        </div>
      )}

      <button className={publicUi.subtleButton} type="button" onClick={() => setShowNewForm((v) => !v)}>
        + novo cadastro
      </button>

      {showNewForm && (
        <form className="contents" onSubmit={handleCreateAndLink}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" required />
          <input value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} placeholder="CPF/CNPJ" />
          {docType === 'cnpj' && (
            <input
              value={companyResponsible}
              onChange={(e) => setCompanyResponsible(e.target.value)}
              placeholder="Responsável pela empresa (opcional)"
            />
          )}
          {docType === 'cpf' && (
            <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Nome da loja (opcional)" />
          )}
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" type="email" />
          <input value={cep} onChange={(e) => setCep(e.target.value)} placeholder="CEP" />
          {createError && <p className={publicUi.error}>{createError}</p>}
          <button className={publicUi.primaryButton} type="submit">Salvar e vincular</button>
        </form>
      )}

      <button className="contents" onClick={() => setExpanded(false)}>Fechar</button>
      {createLoginSection}
    </div>
  );
}

// Visão secundária do "+" — troca o conteúdo do drawer (não abre um painel
// novo, decisão combinada com o usuário) por master + filiais do grupo,
// pra vendedora escolher qual pedido quer seguir.
function MasterGroupPanel({
  masterName,
  rows,
  clientsById,
  onBack,
  onSelect,
}: {
  masterName: string;
  rows: OrderSession[];
  clientsById: Record<string, Client>;
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="contents">
      <button type="button" className={publicUi.talaoViewLink} onClick={onBack}>
        ← voltar
      </button>
      <div className={publicUi.talaoLabel}>{masterName} · matriz e filiais</div>
      <div className="contents">
        {rows.map((s) => {
          const subtext = s.clientId ? clientSubtext(clientsById[s.clientId]) : null;
          return (
            <div key={s.id} className={publicUi.talaoCard} onClick={() => onSelect(s.id)}>
              <div className={publicUi.talaoInfo}>
                <span className={publicUi.talaoName}>{s.clientName}</span>
                {subtext && <span className={publicUi.talaoChannel}>{subtext}</span>}
              </div>
              <div className={publicUi.talaoMeta}>
                <span>{formatBRL(subtotal(s))}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Painel do talão — referência: Colab da Teceo (imagem enviada pelo
// usuário). Ao contrário de uma página de vendedora separada, isso abre
// por cima do catálogo normal (mesmo padrão do CartDrawer): pedido ativo
// em destaque, outros pedidos abertos no talão (cada um com X pra
// fechar), busca de pedidos existentes (reabre um fechado) e criar novo.
// Sem barra de progresso de meta (visto na referência) — não temos esse
// dado ainda, ver PLANO-PROXIMOS-PASSOS.md.
export default function TalaoDrawer() {
  const talao = useTalao();
  const { openCart } = useCart();
  const { href } = useTenant();
  const [query, setQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newChannel, setNewChannel] = useState<'presencial' | 'whatsapp'>('presencial');
  const [isSharing, setSharing] = useState(false);
  const [isCreatingBook, setCreatingBook] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [savingBook, setSavingBook] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [isCancelingBook, setCancelingBook] = useState(false);
  const [isBookMenuOpen, setBookMenuOpen] = useState(false);
  const [secondaryMasterId, setSecondaryMasterId] = useState<string | null>(null);

  const searchResults = useMemo(() => {
    if (!talao) return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return talao.sessions.filter((s) => s.clientName.toLowerCase().includes(q)).slice(0, 8);
  }, [talao, query]);

  if (!talao) return null;

  const { isTalaoOpen, closeTalao, activeBookSessions, cancelledBookSessions, activeSession, selectSession, closeSession, reopenSession, createSession, books, activeBook, selectBook, createBook, cancelBook, clientsById } = talao;

  // Cliente master (parentClientId nulo) com mais de uma sessão aberta no
  // grupo (ela + pelo menos uma filial) — colapsa numa linha só + "+".
  // Filial cuja master também está aberta aqui fica escondida da lista
  // solta (só aparece dentro do "+"); sem a master aberta, não tem em quem
  // colapsar, então a filial aparece normal.
  function masterIdFor(session: OrderSession): string | null {
    if (!session.clientId) return null;
    const client = clientsById[session.clientId];
    if (!client) return null;
    return client.parentClientId ?? client.id;
  }
  const groupCounts = new Map<string, number>();
  for (const s of activeBookSessions) {
    const key = masterIdFor(s);
    if (key) groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
  }
  function isGroupRepresentative(session: OrderSession): boolean {
    if (!session.clientId) return false;
    const client = clientsById[session.clientId];
    if (!client || client.parentClientId) return false;
    return (groupCounts.get(client.id) ?? 0) > 1;
  }
  function isHiddenFilial(session: OrderSession): boolean {
    if (!session.clientId) return false;
    const parentId = clientsById[session.clientId]?.parentClientId;
    if (!parentId) return false;
    return activeBookSessions.some((m) => m.clientId === parentId);
  }

  const others = activeBookSessions.filter((s) => s.id !== activeSession?.id && !isHiddenFilial(s));
  const secondaryRows = secondaryMasterId
    ? activeBookSessions.filter((s) => masterIdFor(s) === secondaryMasterId)
    : [];

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    await createSession(newClientName.trim(), newChannel);
    setNewClientName('');
    setShowNewForm(false);
  }

  function handlePickExisting(session: OrderSession) {
    if (session.status === 'fechado' || session.status === 'cancelado') {
      reopenSession(session.id);
    } else {
      selectSession(session.id);
    }
    setQuery('');
  }

  async function handleSelectBook(id: string) {
    setBookError(null);
    try {
      await selectBook(id);
    } catch (error) {
      setBookError(error instanceof Error ? error.message : 'Não foi possível trocar o talão.');
    }
  }

  async function handleCreateBook(e: FormEvent) {
    e.preventDefault();
    if (!newBookName.trim()) return;
    setSavingBook(true);
    setBookError(null);
    try {
      await createBook(newBookName.trim());
      setNewBookName('');
      setCreatingBook(false);
    } catch (error) {
      setBookError(error instanceof Error ? error.message : 'Não foi possível criar o talão.');
    } finally {
      setSavingBook(false);
    }
  }

  async function handleCancelBook() {
    if (!activeBook) return;
    setBookError(null);
    try {
      await cancelBook(activeBook.id);
    } catch (error) {
      setBookError(error instanceof Error ? error.message : 'Não foi possível cancelar o talão.');
    }
  }

  return (
    <>
      <div className={[publicUi.overlay, isTalaoOpen ? 'block' : 'hidden'].join(' ')} onClick={closeTalao} />
      <aside className={[publicUi.drawerRight, isTalaoOpen ? 'translate-x-0' : 'translate-x-full'].join(' ')}>
        <div className={publicUi.drawerHeader}>
          <h2>talão de pedidos</h2>
          <div className="flex items-center gap-1">
            <button className={publicUi.drawerIconButton} aria-label="Gerar link público" title="Gerar link público" onClick={() => setSharing(true)}><Share2 className="size-4" aria-hidden="true" /></button>
            <button className={publicUi.drawerIconButton} aria-label="Fechar" onClick={closeTalao}><X className="size-4" aria-hidden="true" /></button>
          </div>
        </div>

        <div className={publicUi.drawerBody}>
          {secondaryMasterId ? (
            <MasterGroupPanel
              masterName={clientsById[secondaryMasterId]?.name ?? ''}
              rows={secondaryRows}
              clientsById={clientsById}
              onBack={() => setSecondaryMasterId(null)}
              onSelect={(id) => {
                selectSession(id);
                setSecondaryMasterId(null);
              }}
            />
          ) : (
          <>
          <div className={publicUi.talaoLabel}>talão</div>
          <div className={publicUi.talaoBookRow}>
            <select
              aria-label="Talão atual"
              value={activeBook?.id || ''}
              onChange={(e) => void handleSelectBook(e.target.value)}
              className="min-h-10 flex-1 rounded-control border border-[#ccc] bg-white px-3 text-sm"
            >
              {books.map((book) => (
                <option key={book.id} value={book.id}>{book.name}{book.isActive ? ' · atual' : ''}</option>
              ))}
            </select>
            <div className={publicUi.talaoBookMenuWrap}>
              <button
                className={publicUi.drawerIconButton}
                aria-label="Mais ações do talão"
                onClick={() => setBookMenuOpen((v) => !v)}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
              {isBookMenuOpen && (
                <>
                  <button
                    className="fixed inset-0 z-10 cursor-default"
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={() => setBookMenuOpen(false)}
                  />
                  <div className={publicUi.talaoBookMenuList}>
                    <button
                      className={publicUi.talaoBookMenuItem}
                      type="button"
                      onClick={() => {
                        setCreatingBook((v) => !v);
                        setBookMenuOpen(false);
                      }}
                    >
                      + novo talão
                    </button>
                    {activeBook?.status === 'aberto' && (
                      <button
                        className={[publicUi.talaoBookMenuItem, publicUi.talaoBookMenuItemDanger].join(' ')}
                        type="button"
                        onClick={() => {
                          setCancelingBook(true);
                          setBookMenuOpen(false);
                        }}
                      >
                        Cancelar talão
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <TenantLink href="/workspace/talao" className={publicUi.talaoViewLink}>
            ver talão completo →
          </TenantLink>

          {isCreatingBook && (
            <form className="contents" onSubmit={handleCreateBook}>
              <input
                value={newBookName}
                onChange={(e) => setNewBookName(e.target.value)}
                placeholder="Nome do talão"
                autoFocus
              />
              <button className={publicUi.primaryButton} type="submit" disabled={!newBookName.trim() || savingBook}>
                {savingBook ? 'Criando…' : 'Criar e ativar'}
              </button>
            </form>
          )}

          {bookError && <p className={publicUi.error}>{bookError}</p>}

          <div className={publicUi.talaoLabel}>pedido ativo</div>
          {activeSession ? (
            <>
              {/* key={activeSession.id} força remontar ao trocar ou criar
                  pedido — reinicia a animação de "troquei de cliente"
                  (talaoActiveSwap, ver globals.css) e limpa qualquer busca/
                  estado aberto do cadastro que era da cliente anterior. */}
              <div
                key={`${activeSession.id}-card`}
                className={[publicUi.talaoCard, publicUi.talaoActive].join(' ')}
                onClick={() => {
                  closeTalao();
                  openCart();
                }}
                title="Ver e editar as peças deste pedido"
              >
                <div className={publicUi.talaoInfo}>
                  <span className={publicUi.talaoName}>{activeSession.clientName}</span>
                  <span className={publicUi.talaoChannel}>
                    {(activeSession.clientId && clientSubtext(clientsById[activeSession.clientId])) || CHANNEL_LABELS[activeSession.channel]}
                  </span>
                  {activeSession.status === 'aguardando_pagamento' && (
                    <span className={publicUi.talaoStatus}>aguardando pagamento</span>
                  )}
                </div>
                <div className={publicUi.talaoMetaActive}>
                  <span>{itemCount(activeSession)} itens</span>
                  <span>{formatBRL(subtotal(activeSession))}</span>
                </div>
                {isGroupRepresentative(activeSession) && (
                  <button
                    className={publicUi.talaoArrowButton}
                    aria-label="Ver matriz e filiais"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSecondaryMasterId(activeSession.clientId!);
                    }}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </button>
                )}
                <span className={publicUi.talaoArrowButton}>
                  <ArrowRight className="size-4" aria-hidden="true" />
                </span>
              </div>
              <ClientCadastroSection key={`${activeSession.id}-cadastro`} session={activeSession} />
            </>
          ) : (
            <p className={publicUi.muted}>Nenhum pedido ativo — crie ou selecione um abaixo.</p>
          )}

          {others.length > 0 && (
            <>
              <div className={publicUi.talaoLabel}>outros pedidos no talão</div>
              <div className="contents">
                {others.map((s) => (
                  <div key={s.id} className={publicUi.talaoCard} onClick={() => selectSession(s.id)}>
                    <div className={publicUi.talaoInfo}>
                      <span className={publicUi.talaoName}>{s.clientName}</span>
                      {s.status === 'aguardando_pagamento' && (
                        <span className={publicUi.talaoStatus}>aguardando pagamento</span>
                      )}
                    </div>
                    <div className={publicUi.talaoMeta}>
                      <span>{formatBRL(subtotal(s))}</span>
                    </div>
                    {isGroupRepresentative(s) && (
                      <button
                        className={publicUi.drawerIconButton}
                        aria-label="Ver matriz e filiais"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSecondaryMasterId(s.clientId!);
                        }}
                      >
                        <Plus className="size-4" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      className={publicUi.drawerIconButton}
                      aria-label="Fechar pedido"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeSession(s.id);
                      }}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {cancelledBookSessions.length > 0 && (
            <>
              <div className={publicUi.talaoLabel}>cancelados</div>
              <div className="contents">
                {cancelledBookSessions.map((s) => (
                  <div key={s.id} className={[publicUi.talaoCard, publicUi.talaoCardClosed].join(' ')}>
                    <div className={publicUi.talaoInfo}>
                      <span className={publicUi.talaoName}>{s.clientName || 'Sem cliente'}</span>
                    </div>
                    <button className={publicUi.subtleButton} type="button" onClick={() => reopenSession(s.id)}>
                      Reativar no talão
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={publicUi.talaoLabel}>adicionar mais pedidos ao talão</div>
          <div className={publicUi.talaoAddRow}>
            <div className={publicUi.talaoSearchWrap}>
              <Search className={publicUi.talaoSearchIcon} aria-hidden="true" />
              <input
                className={publicUi.talaoSearchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="buscar existentes"
              />
            </div>
            <button className={publicUi.talaoAddButton} type="button" onClick={() => setShowNewForm((v) => !v)}>
              <Plus className="size-4" aria-hidden="true" />
              criar novo
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className={publicUi.talaoSearchResults}>
              {searchResults.map((s) => (
                <button key={s.id} className={publicUi.talaoSearchResult} onClick={() => handlePickExisting(s)}>
                  <span className={publicUi.talaoName}>{s.clientName}</span>
                  <span className={publicUi.talaoChannel}>{s.status === 'fechado' ? 'fechado — reabrir' : 'aberto'}</span>
                </button>
              ))}
            </div>
          )}

          {showNewForm && (
            <form className="contents" onSubmit={handleCreate}>
              <input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Nome da cliente (opcional)"
                autoFocus
              />
              <select value={newChannel} onChange={(e) => setNewChannel(e.target.value as 'presencial' | 'whatsapp')}>
                <option value="presencial">Presencial</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <button className={publicUi.primaryButton} type="submit">Criar pedido</button>
            </form>
          )}
          </>
          )}
        </div>
      </aside>
      <ConfirmDialog
        open={isCancelingBook}
        onOpenChange={setCancelingBook}
        title="Cancelar talão?"
        description="Os pedidos pendentes e vazios deste talão serão cancelados. Pedidos já finalizados permanecem no histórico. Se algum pedido pendente tiver peças, o cancelamento não será permitido."
        confirmLabel="Cancelar talão"
        destructive
        onConfirm={handleCancelBook}
      />
      <ShareCatalogSheet open={isSharing} onOpenChange={setSharing} publicPath={href('/catalogo')} />
    </>
  );
}
