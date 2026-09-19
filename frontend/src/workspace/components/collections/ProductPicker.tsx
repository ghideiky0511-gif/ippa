// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import ProductImage from '@/components/ProductImage';
import ProductPrice from '@/components/ProductPrice';
import { useEffect, useState } from 'react';
import { fetchProductPicker } from '@/workspace/lib/catalogClient';

export default function ProductPicker({
  products,
  excludeIds,
  onAdd,
  label = 'Adicionar produto',
  placeholder = 'Buscar por nome, referência ou ID...',
  remoteSearch = false,
}) {
  const [query, setQuery] = useState('');
  const [remoteProducts, setRemoteProducts] = useState([]);
  const [searching, setSearching] = useState(false);

  // Casa por nome (busca parcial, ex. "cropped" acha todos os croppeds),
  // por código de referência (REF do ERP, que é o que aparece no card e na
  // página do produto) e pelo ID interno exato — colar o ID continua
  // funcionando.
  const q = query.trim().toLowerCase();
  useEffect(() => {
    if (!remoteSearch || !q) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      fetchProductPicker({ q })
        .then((items) => { if (!controller.signal.aborted) setRemoteProducts(items); })
        .catch(() => { if (!controller.signal.aborted) setRemoteProducts([]); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [q, remoteSearch]);

  const candidates = remoteSearch ? remoteProducts : products || [];
  const results = q
    ? candidates
        .filter((p) => !excludeIds.includes(p.id) && (
          (p.name || '').toLowerCase().includes(q)
          || (p.referenceId || '').toLowerCase().includes(q)
          || String(p.id).toLowerCase() === q
        ))
        .slice(0, 8)
    : [];

  return (
    <div className={adminUi.productPicker}>
      <div className={adminUi.field}>
        <label>{label}</label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
      </div>
      {results.length > 0 && (
        <div className={adminUi.productPickerResults}>
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className={adminUi.productPickerResult}
              onClick={() => {
                onAdd(p.id, p);
                setQuery('');
              }}
            >
              <ProductImage src={p.image} alt={p.name} className="size-12 shrink-0 rounded-control bg-brand-background" />
              <span className="min-w-0 flex-1">
                <span className={adminUi.productName}>{p.name}</span>
                {p.referenceId && (
                  <span className="block truncate text-xs text-brand-muted">REF {p.referenceId}</span>
                )}
              </span>
              <ProductPrice price={p.price} discount={p.activeDiscount} presentation="compact" />
            </button>
          ))}
        </div>
      )}
      {searching && <p className="mt-2 text-xs text-muted-foreground">Buscando produtos…</p>}
    </div>
  );
}
