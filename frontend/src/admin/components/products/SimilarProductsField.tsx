// @ts-nocheck
'use client';

import { useState } from 'react';
import ProductPicker from '@/admin/components/collections/ProductPicker';

// Curadoria manual de "produtos similares" (1 por 1), por produto e por
// contexto (quick-view ou carrinho — ver web/src/lib/similarProducts.ts).
// Recolhido por padrão pra não poluir a busca de /produtos; expande pra
// mostrar a lista escolhida + o picker de adicionar mais. Presença de
// qualquer id aqui substitui a regra automática desse contexto pra esse
// produto — sem completar até o limite, é intencional.
export default function SimilarProductsField({ label, productIds, allProducts, onAdd, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const byId = new Map((allProducts || []).map((p) => [p.id, p]));

  return (
    <div className="similar-products-field">
      <button type="button" className="similar-products-field-toggle" onClick={() => setExpanded((v) => !v)}>
        {label} ({productIds.length}) {expanded ? '▾' : '▸'}
      </button>
      {expanded && (
        <div className="similar-products-field-body">
          <div className="collection-product-list">
            {productIds.map((id) => {
              const p = byId.get(id);
              return (
                <div key={id} className="product-override-row">
                  <img src={p?.image || ''} alt={p?.name || ''} />
                  <div className="product-override-info">
                    <span className="product-item-name">{p?.name || id}</span>
                  </div>
                  <button className="btn btn-icon btn-danger" onClick={() => onRemove(id)} title="Remover">
                    ✕
                  </button>
                </div>
              );
            })}
            {productIds.length === 0 && <p className="preview-empty-text">Nenhuma peça curada — usa a regra automática.</p>}
          </div>
          <ProductPicker products={allProducts} excludeIds={productIds} onAdd={onAdd} />
        </div>
      )}
    </div>
  );
}
