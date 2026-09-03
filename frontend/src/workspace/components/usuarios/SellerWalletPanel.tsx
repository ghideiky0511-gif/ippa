// @ts-nocheck
'use client';
import { useEffect, useState } from 'react';
import { adminUi } from '@/workspace/lib/ui';
import { fetchClientsPage, reassignClientSeller } from '@/workspace/lib/customersClient';

// Carteira de uma vendedora: clientes cuja last_seller_id é esta vendedora
// (ver clients.last_seller_id, setado automaticamente pelo fluxo de
// atendimento — orderSessionService.ts). Aqui o admin só VÊ e REATRIBUI,
// nunca edita o resto do cadastro do cliente (endpoint estreito, ver
// clientService.reassignClientSeller).
export default function SellerWalletPanel({ seller, vendedoras }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reassigningId, setReassigningId] = useState(null);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const page = await fetchClientsPage({ sellerId: seller.id, pageSize: 100 });
      setClients(page.clients);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // setTimeout evita setState síncrono dentro do corpo do efeito (mesmo
    // padrão de WhatsAppIntegrationApp.tsx).
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller.id]);

  async function handleReassign(clientId, newSellerId) {
    if (!newSellerId || newSellerId === seller.id) return;
    setReassigningId(clientId);
    setError('');
    try {
      await reassignClientSeller(clientId, newSellerId);
      setClients((prev) => prev.filter((c) => c.id !== clientId));
    } catch (err) {
      setError(err.message);
    } finally {
      setReassigningId(null);
    }
  }

  if (loading) return <p className={adminUi.previewEmpty}>Carregando carteira…</p>;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {error && <p className="text-[13px] text-[#b00020]">{error}</p>}
      {clients.length === 0 ? (
        <p className={adminUi.previewEmpty}>Nenhuma cliente nesta carteira ainda.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {clients.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-control border border-[#eee] p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                {c.cpfCnpj && <p className="truncate text-xs text-brand-muted">{c.cpfCnpj}</p>}
              </div>
              <select
                className="shrink-0 rounded-lg border border-[#ddd] bg-white px-2 py-1.5 text-xs"
                value={seller.id}
                disabled={reassigningId === c.id}
                onChange={(e) => handleReassign(c.id, e.target.value)}
              >
                <option value={seller.id}>{seller.name}</option>
                {vendedoras.filter((v) => v.id !== seller.id).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
