'use client';

import { useState } from 'react';

export default function CollectionsList({ collections, selectedId, onSelect, onAdd, onRemove }) {
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
        {collections.map((c) => (
          <div key={c.id} className={`collection-item${selectedId === c.id ? ' active' : ''}`}>
            <button className="collection-item-btn" onClick={() => onSelect(c.id)}>
              {c.label}
              <span className="collection-item-count">{c.productIds.length}</span>
            </button>
            <button
              className="btn btn-icon btn-danger"
              onClick={() => onRemove(c.id)}
              title="Excluir coleção"
            >
              ✕
            </button>
          </div>
        ))}
        {collections.length === 0 && <p className="preview-empty-text">Nenhuma coleção ainda.</p>}
      </div>

      <div className="collections-new">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nome da nova coleção"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn" onClick={handleAdd}>+ Nova coleção</button>
      </div>
    </aside>
  );
}
