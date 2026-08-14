'use client';

import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import AdminNav from '@/components/AdminNav';
import { saveCatalogOrder } from '@/lib/catalogOrderClient';
import SortableCatalogCard from './SortableCatalogCard';

// Critérios de ordenação automática — cada um só recalcula `order` a partir
// dos produtos atuais; depois de aplicado, o admin ainda pode arrastar cards
// individualmente pra ajustar (mesmo fluxo de "sujo" que o drag-and-drop).
const SORT_OPTIONS = [
  { value: '', label: 'Ordenar por…' },
  { value: 'name-asc', label: 'Nome (A-Z)' },
  { value: 'name-desc', label: 'Nome (Z-A)' },
  { value: 'price-asc', label: 'Preço (menor primeiro)' },
  { value: 'price-desc', label: 'Preço (maior primeiro)' },
  { value: 'discount-desc', label: 'Desconto (maior primeiro)' },
  { value: 'collection-asc', label: 'Coleção (A-Z)' },
];

function compareBySort(a, b, sortBy) {
  switch (sortBy) {
    case 'name-asc':
      return (a.name || '').localeCompare(b.name || '', 'pt-BR');
    case 'name-desc':
      return (b.name || '').localeCompare(a.name || '', 'pt-BR');
    case 'price-asc':
      return (a.price ?? 0) - (b.price ?? 0);
    case 'price-desc':
      return (b.price ?? 0) - (a.price ?? 0);
    case 'discount-desc':
      return (b.activeDiscount?.percent ?? 0) - (a.activeDiscount?.percent ?? 0);
    case 'collection-asc':
      return (
        (a.collection || '').localeCompare(b.collection || '', 'pt-BR') ||
        (a.name || '').localeCompare(b.name || '', 'pt-BR')
      );
    default:
      return 0;
  }
}

// Editor de posição do /catalogo — diferente do editor da home (canvas
// livre, x/y/largura/altura por bloco): aqui os cards têm todos o mesmo
// tamanho, então a única coisa editável é a posição, e "posição" é só o
// lugar na sequência (ordem), não coordenada de pixel. dnd-kit sortable com
// grade retangular (rectSortingStrategy) já resolve isso: arrasta um card
// pra qualquer direção, os outros se reorganizam ao redor — mesma mecânica
// de reordenar arquivos numa grade do explorador.
export default function CatalogOrderApp({ products }) {
  const [order, setOrder] = useState((products || []).map((p) => p.id));
  const [saveState, setSaveState] = useState('idle');
  const [dirty, setDirty] = useState(false);
  const [sortBy, setSortBy] = useState('');

  const byId = new Map((products || []).map((p) => [p.id, p]));
  const orderedProducts = order.map((id) => byId.get(id)).filter(Boolean);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(active.id);
      const newIndex = prev.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    setDirty(true);
  }

  function handleSortChange(e) {
    const value = e.target.value;
    setSortBy(value);
    if (!value) return;
    setOrder((prev) => {
      const items = prev.map((id) => byId.get(id)).filter(Boolean);
      items.sort((a, b) => compareBySort(a, b, value));
      return items.map((p) => p.id);
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaveState('saving');
    try {
      await saveCatalogOrder(order);
      setSaveState('saved');
      setDirty(false);
    } catch {
      setSaveState('error');
    }
  }

  return (
    <div className="catalog-order-page">
      <div className="builder-topbar">
        <div className="builder-topbar-left">
          <h1>Editor do catálogo</h1>
          <AdminNav />
        </div>
        <div>
          {saveState === 'saved' && !dirty && <span className="status">Salvo</span>}
          {saveState === 'error' && <span className="status">Erro ao salvar</span>}
          {dirty && saveState !== 'saving' && <span className="status">Alterações não salvas</span>}
          <button className="btn btn-primary" onClick={handleSave} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      <p className="canvas-hint">
        Todos os cards têm o mesmo tamanho — só a posição é editável. Arraste um card em qualquer direção pra
        mudar a ordem; essa é a ordem que aparece em /catalogo quando nenhum filtro/busca está ativo. Produto
        novo (ainda não posicionado) entra no fim, na ordem natural do catálogo.
      </p>

      <div className="catalog-order-toolbar">
        <div className="field">
          <label>Ordenar cards</label>
          <select value={sortBy} onChange={handleSortChange}>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="catalog-order-grid">
            {orderedProducts.map((p) => (
              <SortableCatalogCard key={p.id} product={p} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
