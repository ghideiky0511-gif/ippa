'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTalao } from './TalaoProvider';
import { useCart } from './CartProvider';
import { formatBRL } from '@/lib/format';
import { getDocumentType } from '@/lib/document';
import type { Client, OrderSession } from '@/lib/types';

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

// Cadastro de cliente vinculado ao pedido ativo — combinado com o usuário:
// a vendedora consegue montar o carrinho livre, sem cadastro nenhum
// (session.clientId fica vazio, só o nome livre em session.clientName);
// vincular um cadastro (CPF/CNPJ, e-mail, CEP) é opcional aqui, mas fica
// obrigatório antes do frete (isClientComplete, web/src/lib/clientComplete.ts,
// aplicada em /frete e /pagamento via useTalaoClientGate.ts).
function ClientCadastroSection({ session }: { session: OrderSession }) {
  const talao = useTalao()!;
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

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      fetch(`/api/clients?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setResults)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

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
  }

  async function handleLinkExisting(client: Client) {
    await talao.linkClient(client.id);
    setQuery('');
    setResults([]);
    setExpanded(false);
    setJustLinked(true);
  }

  if (!expanded) {
    return (
      <button
        className={'talao-cadastro-toggle' + (justLinked ? ' just-linked' : '')}
        onClick={() => setExpanded(true)}
        onAnimationEnd={() => setJustLinked(false)}
      >
        {session.clientId ? `Cadastro vinculado: ${session.clientName} (editar)` : 'Vincular cadastro (CPF/CNPJ, e-mail, CEP)'}
      </button>
    );
  }

  return (
    <div className="talao-cadastro-panel">
      <div className="field">
        <label>Buscar cadastro existente</label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome ou CPF/CNPJ" autoFocus />
      </div>

      {results.length > 0 && (
        <div className="talao-search-results">
          {results.map((c) => (
            <button key={c.id} className="talao-search-result" onClick={() => handleLinkExisting(c)}>
              <span>{c.name}</span>
              <span className="talao-card-channel">{c.cpfCnpj || 'sem CPF/CNPJ'}</span>
            </button>
          ))}
        </div>
      )}

      <button className="btn-clear" type="button" onClick={() => setShowNewForm((v) => !v)}>
        + novo cadastro
      </button>

      {showNewForm && (
        <form className="talao-new-form" onSubmit={handleCreateAndLink}>
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
          {createError && <p className="login-error">{createError}</p>}
          <button className="btn-add" type="submit">Salvar e vincular</button>
        </form>
      )}

      <button className="talao-cadastro-toggle" onClick={() => setExpanded(false)}>Fechar</button>
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
  const [query, setQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newChannel, setNewChannel] = useState<'presencial' | 'whatsapp'>('presencial');

  const searchResults = useMemo(() => {
    if (!talao) return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return talao.sessions.filter((s) => s.clientName.toLowerCase().includes(q)).slice(0, 8);
  }, [talao, query]);

  if (!talao) return null;

  const { isTalaoOpen, closeTalao, openSessions, activeSession, selectSession, closeSession, reopenSession, createSession } = talao;
  const others = openSessions.filter((s) => s.id !== activeSession?.id);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    await createSession(newClientName.trim(), newChannel);
    setNewClientName('');
    setShowNewForm(false);
  }

  function handlePickExisting(session: OrderSession) {
    if (session.status === 'fechado') {
      reopenSession(session.id);
    } else {
      selectSession(session.id);
    }
    setQuery('');
  }

  return (
    <>
      <div className={'talao-overlay' + (isTalaoOpen ? ' open' : '')} onClick={closeTalao} />
      <aside className={'talao-drawer' + (isTalaoOpen ? ' open' : '')}>
        <div className="talao-header">
          <h2>talão de pedidos</h2>
          <button aria-label="Fechar" onClick={closeTalao}>&times;</button>
        </div>

        <div className="talao-body">
          <div className="talao-section-label">pedido ativo</div>
          {activeSession ? (
            <>
              {/* key={activeSession.id} força remontar ao trocar ou criar
                  pedido — reinicia a animação de "troquei de cliente"
                  (talaoActiveSwap, ver globals.css) e limpa qualquer busca/
                  estado aberto do cadastro que era da cliente anterior. */}
              <button
                key={`${activeSession.id}-card`}
                className="talao-active-card"
                onClick={() => {
                  closeTalao();
                  openCart();
                }}
                title="Ver e editar as peças deste pedido"
              >
                <div className="talao-card-info">
                  <span className="talao-card-name">{activeSession.clientName}</span>
                  <span className="talao-card-channel">{CHANNEL_LABELS[activeSession.channel]}</span>
                  {activeSession.status === 'aguardando_pagamento' && (
                    <span className="talao-status-badge">aguardando pagamento</span>
                  )}
                </div>
                <div className="talao-card-meta">
                  <span>{itemCount(activeSession)} itens</span>
                  <span className="talao-card-total">{formatBRL(subtotal(activeSession))}</span>
                </div>
                <span className="talao-card-arrow">→</span>
              </button>
              <ClientCadastroSection key={`${activeSession.id}-cadastro`} session={activeSession} />
            </>
          ) : (
            <p className="preview-empty-text">Nenhum pedido ativo — crie ou selecione um abaixo.</p>
          )}

          {others.length > 0 && (
            <>
              <div className="talao-section-label">outros pedidos no talão</div>
              <div className="talao-other-list">
                {others.map((s) => (
                  <div key={s.id} className="talao-other-card" onClick={() => selectSession(s.id)}>
                    <div className="talao-card-info">
                      <span className="talao-card-name">{s.clientName}</span>
                      <span className="talao-card-channel">{CHANNEL_LABELS[s.channel]}</span>
                      {s.status === 'aguardando_pagamento' && (
                        <span className="talao-status-badge">aguardando pagamento</span>
                      )}
                    </div>
                    <div className="talao-card-meta">
                      <span>{itemCount(s)} itens</span>
                      <span className="talao-card-total">{formatBRL(subtotal(s))}</span>
                    </div>
                    <button
                      className="talao-card-remove"
                      aria-label="Fechar pedido"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeSession(s.id);
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="talao-section-label">adicionar mais pedidos ao talão</div>
          <div className="talao-add-row">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="buscar existentes" />
            <button className="btn-add" type="button" onClick={() => setShowNewForm((v) => !v)}>
              + criar novo
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="talao-search-results">
              {searchResults.map((s) => (
                <button key={s.id} className="talao-search-result" onClick={() => handlePickExisting(s)}>
                  <span>{s.clientName}</span>
                  <span className="talao-card-channel">{s.status === 'fechado' ? 'fechado — reabrir' : 'aberto'}</span>
                </button>
              ))}
            </div>
          )}

          {showNewForm && (
            <form className="talao-new-form" onSubmit={handleCreate}>
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
              <button className="btn-add" type="submit">Criar pedido</button>
            </form>
          )}
        </div>
      </aside>
    </>
  );
}
