// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import ProductImage from '@/components/ProductImage';
import ProductPrice from '@/components/ProductPrice';
import { useState } from 'react';

export default function ProductPicker({
  products,
  excludeIds,
  onAdd,
  label = 'Adicionar produto',
  placeholder = 'Buscar por nome, referência ou ID...',
}) {
  const [query, setQuery] = useState('');

  // Casa por nome (busca parcial, ex. "cropped" acha todos os croppeds),
  // por código de referência (REF do ERP, que é o que aparece no card e na
  // página do produto) e pelo ID interno exato — colar o ID continua
  // funcionando.
  const q = query.trim().toLowerCase();
  const results = q
    ? (products || [])
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
                onAdd(p.id);
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
    </div>
  );
}
