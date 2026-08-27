// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { useState } from 'react';
import ProductPicker from '@/workspace/components/collections/ProductPicker';
import ProductImage from '@/components/ProductImage';
import { Trash2 } from 'lucide-react';

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
    <div className={adminUi.similarField}>
      <button type="button" className={adminUi.similarToggle} onClick={() => setExpanded((v) => !v)}>
        {label} ({productIds.length}) {expanded ? '▾' : '▸'}
      </button>
      {expanded && (
        <div className={adminUi.similarBody}>
          <div className={adminUi.productList}>
            {productIds.map((id) => {
              const p = byId.get(id);
              return (
                <div key={id} className={adminUi.overrideRow}>
                  <ProductImage src={p?.image} alt={p?.name || ''} className="size-12 shrink-0 rounded-control bg-brand-background" />
                  <div className={adminUi.productInfo}>
                    <span className={adminUi.productName}>{p?.name || id}</span>
                  </div>
                  <button className={adminUi.iconButton} onClick={() => onRemove(id)} title="Remover">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
            {productIds.length === 0 && <p className={adminUi.previewEmpty}>Nenhuma peça curada — usa a regra automática.</p>}
          </div>
          <ProductPicker products={allProducts} excludeIds={productIds} onAdd={onAdd} />
        </div>
      )}
    </div>
  );
}
