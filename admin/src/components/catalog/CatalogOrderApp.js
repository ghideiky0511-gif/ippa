'use client';

import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import AdminNav from '@/components/AdminNav';
import { saveCatalogOrder } from '@/lib/catalogOrderClient';
import SortableCatalogCard from './SortableCatalogCard';

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
