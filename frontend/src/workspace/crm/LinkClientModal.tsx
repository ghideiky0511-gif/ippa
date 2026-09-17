'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { adminUi } from '@/workspace/lib/ui';
import { searchOrderClients } from '@/lib/ordersClient';
import type { Client } from '@/domain/clients/types';
import { linkCrmConversationClient } from '@/workspace/lib/crmClient';

// Vincula manualmente uma conversa a um cliente do catálogo -- usado tanto
// para o caso comum (busca livre) quanto para desambiguar um auto-match que
// encontrou mais de um cliente com o mesmo telefone (matriz/filial, ver
// crmConversationService.ts), caso em que `linkCandidates` já vem
// preenchido como atalho.
export default function LinkClientModal({
  conversationId,
  currentClientId,
  linkCandidates,
  onClose,
  onLinked,
}: {
  conversationId: string;
  currentClientId: string | null;
  linkCandidates?: Client[];
  onClose: () => void;
  onLinked: (clientId: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = window.setTimeout(() => {
      searchOrderClients(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  async function handleLink(clientId: string | null) {
    setSavingId(clientId ?? 'unlink');
    setError(null);
    try {
      const result = await linkCrmConversationClient(conversationId, clientId);
      onLinked(result.clientId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível vincular o cliente.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className={adminUi.modalOverlay} role="dialog" aria-modal="true" aria-label="Vincular cliente à conversa">
      <section className={adminUi.modalPanel}>
        <header className={adminUi.modalHeader}>
          <div>
            <h2 className="font-bold">Vincular cliente</h2>
            <p className="mt-1 text-sm text-brand-muted">Liga esta conversa a um cadastro do catálogo. Fica valendo até alguém trocar.</p>
          </div>
          <button type="button" className={adminUi.iconButton} onClick={onClose} aria-label="Fechar">
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <div className={`${adminUi.modalBody} flex flex-col gap-4`}>
          {linkCandidates && linkCandidates.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">Mais de um cliente usa este telefone:</p>
              {linkCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm hover:border-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={savingId !== null}
                  onClick={() => void handleLink(candidate.id)}
                >
                  <span>{candidate.name}</span>
                  <span className="text-xs text-muted-foreground">{candidate.cpfCnpj || 'sem CPF/CNPJ'}</span>
                </button>
              ))}
            </div>
          )}

          <div className={adminUi.field}>
            <label>Buscar outra cliente</label>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, e-mail ou CPF/CNPJ..." />
          </div>
          {searching && <p className="text-sm text-muted-foreground">Buscando...</p>}
          {results.length > 0 && (
            <ul className="flex flex-col gap-1">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm hover:border-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={savingId !== null}
                    onClick={() => void handleLink(result.id)}
                  >
                    <span>{result.name}</span>
                    <span className="text-xs text-muted-foreground">{result.cpfCnpj || 'sem CPF/CNPJ'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="text-sm text-[#b00020]">{error}</p>}
        </div>
        <footer className={adminUi.modalFooter}>
          {currentClientId && (
            <button type="button" className={adminUi.dangerButton} disabled={savingId !== null} onClick={() => void handleLink(null)}>
              {savingId === 'unlink' ? 'Desvinculando...' : 'Desvincular'}
            </button>
          )}
          <button type="button" className={adminUi.button} onClick={onClose}>Fechar</button>
        </footer>
      </section>
    </div>
  );
}
