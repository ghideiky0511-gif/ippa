// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
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
              className={adminUi.productPickerResult}
              onClick={() => {
                onAdd(p.id);
                setQuery('');
              }}
            >
              <img src={p.image || ''} alt={p.name} />
              <span className={adminUi.productName} style={{ flex: 1 }}>
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
