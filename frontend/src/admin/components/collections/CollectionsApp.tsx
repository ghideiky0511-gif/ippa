// @ts-nocheck
'use client';
import { adminUi } from '@/admin/lib/ui';
import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import CollectionsList from './CollectionsList';
import CollectionEditor from './CollectionEditor';
import AdminNav from '@/admin/components/AdminNav';
import { saveHighlights } from '@/admin/lib/highlightsClient';

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function CollectionsApp({ initialHighlights, products }) {
  const [highlights, setHighlights] = useState(initialHighlights || []);
  const [selectedId, setSelectedId] = useState(initialHighlights?.[0]?.id || null);
  const [saveState, setSaveState] = useState('idle');
  const [dirty, setDirty] = useState(false);

  const selected = highlights.find((h) => h.id === selectedId) || null;

  // Coleção é só uma lista 1D reordenável (não um canvas livre como a
  // home) — dnd-kit sortable puro serve bem aqui, sem precisar do
  // esquema de x/y/drag-próprio que a home usa.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function addCollection(label) {
    const collection = { id: newId(), label, productIds: [] };
    setHighlights((prev) => [...prev, collection]);
    setSelectedId(collection.id);
    setDirty(true);
  }

  function removeCollection(id) {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
    setDirty(true);
  }

  function updateCollection(id, updater) {
    setHighlights((prev) => prev.map((h) => (h.id === id ? updater(h) : h)));
    setDirty(true);
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id || !selected) return;
    const oldIndex = selected.productIds.indexOf(active.id);
    const newIndex = selected.productIds.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    updateCollection(selected.id, (h) => ({ ...h, productIds: arrayMove(h.productIds, oldIndex, newIndex) }));
  }

  async function handleSave() {
    setSaveState('saving');
    try {
      await saveHighlights(highlights);
      setSaveState('saved');
      setDirty(false);
    } catch (err) {
      setSaveState('error');
    }
  }

  return (
    <div className={adminUi.collectionsPage}>
      <div className={adminUi.topbar}>
        <div className={adminUi.topbarLeft}>
          <h1>Coleções</h1>
          <AdminNav />
        </div>
        <div>
          {saveState === 'saved' && !dirty && <span className={adminUi.status}>Salvo</span>}
          {saveState === 'error' && <span className={adminUi.status}>Erro ao salvar</span>}
          {dirty && saveState !== 'saving' && <span className={adminUi.status}>Alterações não salvas</span>}
          <button className={adminUi.primaryButton} onClick={handleSave} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      <CollectionsList
        collections={highlights}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onAdd={addCollection}
        onRemove={removeCollection}
      />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {selected ? (
          <SortableContext items={selected.productIds} strategy={verticalListSortingStrategy}>
            <CollectionEditor
              collection={selected}
              products={products}
              onUpdate={(updater) => updateCollection(selected.id, updater)}
            />
          </SortableContext>
        ) : (
          <main className={adminUi.collectionsEditor}>
            <p className={adminUi.previewEmpty}>Selecione uma coleção à esquerda ou crie uma nova.</p>
          </main>
        )}
      </DndContext>
    </div>
  );
}
