// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';

export default function CollectionsList({ collections, selectedId, onSelect, onAdd, onRemove }) {
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
        {collections.map((c) => (
          <div key={c.id} className={[adminUi.collectionItem, selectedId === c.id ? 'bg-brand-background text-brand-primary' : ''].join(' ')}>
            <button className={adminUi.collectionItemButton} onClick={() => onSelect(c.id)}>
              {c.label}
              <span className={adminUi.collectionCount}>{c.productIds.length}</span>
            </button>
            <button
              className={adminUi.iconButton}
              onClick={() => onRemove(c.id)}
              title="Excluir coleção"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        {collections.length === 0 && <p className={adminUi.previewEmpty}>Nenhuma coleção ainda.</p>}
      </div>

      <div className={adminUi.collectionsNew}>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nome da nova coleção"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className={adminUi.button} onClick={handleAdd}>+ Nova coleção</button>
      </div>
    </aside>
  );
}
