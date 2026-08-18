// @ts-nocheck
'use client';

import { useState } from 'react';

export default function DiscountsList({ discounts, selectedId, onSelect, onAdd, onRemove }) {
  const [newLabel, setNewLabel] = useState('');

  function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    onAdd(label);
    setNewLabel('');
  }

  return (
    <aside className="collections-sidebar">
      <div className="collections-list">
        {discounts.map((d) => (
          <div key={d.id} className={`collection-item${selectedId === d.id ? ' active' : ''}`}>
            <button className="collection-item-btn" onClick={() => onSelect(d.id)}>
              {d.label}
              <span className="collection-item-count">{d.active ? 'ativo' : 'inativo'}</span>
            </button>
            <button className="btn btn-icon btn-danger" onClick={() => onRemove(d.id)} title="Excluir desconto">
              ✕
            </button>
          </div>
        ))}
        {discounts.length === 0 && <p className="preview-empty-text">Nenhum desconto ainda.</p>}
      </div>

      <div className="collections-new">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nome do novo desconto"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn" onClick={handleAdd}>+ Novo desconto</button>
      </div>
    </aside>
  );
}
