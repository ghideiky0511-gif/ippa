// @ts-nocheck
'use client';
import { adminUi } from '@/admin/lib/ui';
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
    <aside className={adminUi.collectionsSidebar}>
      <div className={adminUi.collectionsList}>
        {discounts.map((d) => (
          <div key={d.id} className={[adminUi.collectionItem, selectedId === d.id ? 'bg-brand-background text-brand-primary' : ''].join(' ')}>
            <button className={adminUi.collectionItemButton} onClick={() => onSelect(d.id)}>
              {d.label}
              <span className={adminUi.collectionCount}>{d.active ? 'ativo' : 'inativo'}</span>
            </button>
            <button className={adminUi.iconButton} onClick={() => onRemove(d.id)} title="Excluir desconto">
              ✕
            </button>
          </div>
        ))}
        {discounts.length === 0 && <p className={adminUi.previewEmpty}>Nenhum desconto ainda.</p>}
      </div>

      <div className={adminUi.collectionsNew}>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nome do novo desconto"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className={adminUi.button} onClick={handleAdd}>+ Novo desconto</button>
      </div>
    </aside>
  );
}
