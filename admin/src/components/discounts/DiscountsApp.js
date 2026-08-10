'use client';

import { useState } from 'react';
import DiscountsList from './DiscountsList';
import DiscountEditor from './DiscountEditor';
import AdminNav from '@/components/AdminNav';
import { saveDiscounts } from '@/lib/discountsClient';

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function newDiscount(label) {
  return {
    id: newId(),
    label,
    active: true,
    type: 'quantity',
    tiers: [{ minQty: 10, percent: 10 }],
    productIds: [],
    percent: 10,
  };
}

// Cadastro de regras de desconto (plataforma admin) — mesmo padrão de
// lista+editor do /colecoes (CollectionsApp.js): tudo em memória até
// clicar "Salvar", que manda o array inteiro pro /api/discounts. Só
// cadastro por enquanto — aplicar isso no cálculo do carrinho/checkout do
// app `web` é um próximo passo (ver PLANO-PROXIMOS-PASSOS.md).
export default function DiscountsApp({ initialDiscounts, products }) {
  const [discounts, setDiscounts] = useState(initialDiscounts || []);
  const [selectedId, setSelectedId] = useState(initialDiscounts?.[0]?.id || null);
  const [saveState, setSaveState] = useState('idle');
  const [dirty, setDirty] = useState(false);

  const selected = discounts.find((d) => d.id === selectedId) || null;

  function addDiscount(label) {
    const discount = newDiscount(label);
    setDiscounts((prev) => [...prev, discount]);
    setSelectedId(discount.id);
    setDirty(true);
  }

  function removeDiscount(id) {
    setDiscounts((prev) => prev.filter((d) => d.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
    setDirty(true);
  }

  function updateDiscount(id, updater) {
    setDiscounts((prev) => prev.map((d) => (d.id === id ? updater(d) : d)));
    setDirty(true);
  }

  async function handleSave() {
    setSaveState('saving');
    try {
      await saveDiscounts(discounts);
      setSaveState('saved');
      setDirty(false);
    } catch {
      setSaveState('error');
    }
  }

  return (
    <div className="collections-page">
      <div className="builder-topbar">
        <div className="builder-topbar-left">
          <h1>Descontos</h1>
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

      <DiscountsList
        discounts={discounts}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onAdd={addDiscount}
        onRemove={removeDiscount}
      />

      {selected ? (
        <DiscountEditor
          discount={selected}
          products={products}
          onUpdate={(updater) => updateDiscount(selected.id, updater)}
        />
      ) : (
        <main className="collections-editor">
          <p className="preview-empty-text">Selecione um desconto à esquerda ou crie um novo.</p>
        </main>
      )}
    </div>
  );
}
