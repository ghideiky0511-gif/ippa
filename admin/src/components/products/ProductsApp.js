'use client';

import { useMemo, useState } from 'react';
import AdminNav from '@/components/AdminNav';
import SimilarProductsField from './SimilarProductsField';
import { formatBRL, formatMarkup } from '@/lib/format';
import { saveProductOverrides } from '@/lib/productOverridesClient';
import { saveStoreSettings } from '@/lib/storeSettingsClient';

function toNumberOrUndefined(raw) {
  if (raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export default function ProductsApp({ products, initialOverrides, initialSettings }) {
  const [overrides, setOverrides] = useState(initialOverrides || {});
  const [rowSaveState, setRowSaveState] = useState({}); // productId -> 'saving' | 'saved' | 'error'
  const [query, setQuery] = useState('');

  const [defaultMarkupInput, setDefaultMarkupInput] = useState(
    initialSettings?.defaultMarkup != null ? String(initialSettings.defaultMarkup) : ''
  );
  const [defaultMarkupSaveState, setDefaultMarkupSaveState] = useState('idle');

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return (products || [])
      .filter((p) => {
        const sku = overrides[p.id]?.sku || '';
        return (p.name || '').toLowerCase().includes(q) || sku.toLowerCase().includes(q);
      })
      .slice(0, 20);
  }, [products, overrides, q]);

  function updateField(id, field, value) {
    setOverrides((prev) => {
      const next = { ...(prev[id] || {}), [field]: value };
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) delete next[field];
      return { ...prev, [id]: next };
    });
    setRowSaveState((prev) => ({ ...prev, [id]: undefined }));
  }

  function addSimilarProduct(id, field, productId) {
    const current = overrides[id]?.[field] || [];
    if (current.includes(productId)) return;
    updateField(id, field, [...current, productId]);
  }

  function removeSimilarProduct(id, field, productId) {
    const current = overrides[id]?.[field] || [];
    updateField(id, field, current.filter((pid) => pid !== productId));
  }

  async function handleAlterar(id) {
    setRowSaveState((prev) => ({ ...prev, [id]: 'saving' }));
    try {
      const cleaned = Object.fromEntries(
        Object.entries(overrides).filter(([, o]) => o && Object.keys(o).length > 0)
      );
      await saveProductOverrides(cleaned);
      setOverrides(cleaned);
      setRowSaveState((prev) => ({ ...prev, [id]: 'saved' }));
    } catch {
      setRowSaveState((prev) => ({ ...prev, [id]: 'error' }));
    }
  }

  async function handleApplyDefaultMarkup() {
    setDefaultMarkupSaveState('saving');
    try {
      const defaultMarkup = toNumberOrUndefined(defaultMarkupInput);
      await saveStoreSettings(defaultMarkup ? { defaultMarkup } : {});
      setDefaultMarkupSaveState('saved');
    } catch {
      setDefaultMarkupSaveState('error');
    }
  }

  return (
    <div className="products-page">
      <div className="builder-topbar">
        <div className="builder-topbar-left">
          <h1>Produtos</h1>
          <AdminNav />
        </div>
      </div>

      <main className="products-editor">
        <p className="preview-empty-text">
          Código, preço sugerido de revenda e markup são dados opcionais da loja — quando o Bippa/ERP mandar
          esses campos direto no catálogo, eles aparecem sozinhos; o que for editado aqui tem prioridade sobre
          o dado do ERP. O chip de markup no catálogo só aparece com o preço sugerido preenchido (por aqui,
          pelo markup padrão abaixo, ou pelo ERP), e só se a loja tiver essa funcionalidade ligada em{' '}
          <code>CONFIG.features.suggestedPrice</code>.
        </p>

        <div className="default-markup-panel">
          <div className="field" style={{ maxWidth: 200 }}>
            <label>Markup sugerido padrão (todas as peças)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={defaultMarkupInput}
              onChange={(e) => {
                setDefaultMarkupInput(e.target.value);
                setDefaultMarkupSaveState('idle');
              }}
              placeholder="ex.: 2.3"
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleApplyDefaultMarkup}
            disabled={defaultMarkupSaveState === 'saving'}
          >
            {defaultMarkupSaveState === 'saving' ? 'Aplicando…' : 'Aplicar a todas as peças'}
          </button>
          {defaultMarkupSaveState === 'saved' && <span className="status">Aplicado</span>}
          {defaultMarkupSaveState === 'error' && <span className="status">Erro ao salvar</span>}
        </div>
        <p className="preview-empty-text">
          Vale só pra peça sem preço sugerido/markup próprio (nem do ERP, nem editado abaixo). Pra uma peça
          específica ficar diferente do padrão, busque ela abaixo e altere direto — a edição da peça sempre
          tem prioridade sobre o padrão.
        </p>

        <div className="field" style={{ maxWidth: 360 }}>
          <label>Buscar produto</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome ou código..." />
        </div>

        <div className="product-overrides-list">
          {results.map((p) => {
            const o = overrides[p.id] || {};
            const state = rowSaveState[p.id];
            return (
              <div key={p.id} className="product-row-card">
                <div className="product-override-row">
                  <img src={p.image || ''} alt={p.name} />
                  <div className="product-override-info">
                    <span className="product-item-name">{p.name}</span>
                    <span className="product-item-price">Atacado: {formatBRL(p.price)}</span>
                  </div>
                  <div className="field">
                    <label>Código</label>
                    <input
                      value={o.sku ?? ''}
                      onChange={(e) => updateField(p.id, 'sku', e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="field">
                    <label>Preço sugerido</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={o.suggestedRetailPrice ?? ''}
                      onChange={(e) => updateField(p.id, 'suggestedRetailPrice', toNumberOrUndefined(e.target.value))}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="field">
                    <label>Markup {p.markup ? `(${formatMarkup(p.markup)} hoje)` : ''}</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={o.markup ?? ''}
                      onChange={(e) => updateField(p.id, 'markup', toNumberOrUndefined(e.target.value))}
                      placeholder="Auto"
                    />
                  </div>
                  <div className="product-override-actions">
                    <button className="btn btn-primary" onClick={() => handleAlterar(p.id)} disabled={state === 'saving'}>
                      {state === 'saving' ? 'Alterando…' : 'Alterar'}
                    </button>
                    {state === 'saved' && <span className="status">Alterado</span>}
                    {state === 'error' && <span className="status">Erro</span>}
                  </div>
                </div>
                <SimilarProductsField
                  label="Produtos similares — quick-view"
                  productIds={o.similarProductIdsQuickview || []}
                  allProducts={products}
                  onAdd={(id) => addSimilarProduct(p.id, 'similarProductIdsQuickview', id)}
                  onRemove={(id) => removeSimilarProduct(p.id, 'similarProductIdsQuickview', id)}
                />
                <SimilarProductsField
                  label="Produtos similares — carrinho"
                  productIds={o.similarProductIdsCart || []}
                  allProducts={products}
                  onAdd={(id) => addSimilarProduct(p.id, 'similarProductIdsCart', id)}
                  onRemove={(id) => removeSimilarProduct(p.id, 'similarProductIdsCart', id)}
                />
              </div>
            );
          })}
          {q && results.length === 0 && <p className="preview-empty-text">Nenhum produto encontrado.</p>}
          {!q && <p className="preview-empty-text">Busque um produto pra editar código, preço sugerido ou markup.</p>}
        </div>
      </main>
    </div>
  );
}
