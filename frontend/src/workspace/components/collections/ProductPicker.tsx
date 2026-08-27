// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import ProductImage from '@/components/ProductImage';
import { useState } from 'react';
import { formatBRL } from '@/workspace/lib/format';

export default function ProductPicker({ products, excludeIds, onAdd }) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const results = q
    ? (products || [])
        .filter((p) => !excludeIds.includes(p.id) && (p.name || '').toLowerCase().includes(q))
        .slice(0, 8)
    : [];

  return (
    <div className={adminUi.productPicker}>
      <div className={adminUi.field}>
        <label>Adicionar produto</label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome..." />
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
              <span className={`${adminUi.productName} flex-1`}>
                {p.name}
              </span>
              <span className={adminUi.productPrice}>{formatBRL(p.price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
