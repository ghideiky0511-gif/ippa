'use client';

import { useState } from 'react';
import { formatBRL } from '@/admin/lib/format';

export default function ProductPicker({ products, excludeIds, onAdd }) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const results = q
    ? (products || [])
        .filter((p) => !excludeIds.includes(p.id) && (p.name || '').toLowerCase().includes(q))
        .slice(0, 8)
    : [];

  return (
    <div className="product-picker">
      <div className="field">
        <label>Adicionar produto</label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome..." />
      </div>
      {results.length > 0 && (
        <div className="product-picker-results">
          {results.map((p) => (
            <button
              key={p.id}
              className="product-picker-result"
              onClick={() => {
                onAdd(p.id);
                setQuery('');
              }}
            >
              <img src={p.image || ''} alt={p.name} />
              <span className="product-item-name" style={{ flex: 1 }}>
                {p.name}
              </span>
              <span className="product-item-price">{formatBRL(p.price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
