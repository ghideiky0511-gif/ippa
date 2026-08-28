// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import ProductImage from '@/components/ProductImage';
import ProductPrice from '@/components/ProductPrice';
import ProductPicker from '@/workspace/components/collections/ProductPicker';
import { Trash2 } from 'lucide-react';

export default function ProductBlockEditor({ section, onUpdate, products }) {
  // Aceita valor com espaço/quebra de linha vindo de colagem antiga e
  // compara como string dos dois lados (o ID pode ter sido salvo como
  // número em versões anteriores).
  const productId = String(section.productId || '').trim();
  const product = (products || []).find((p) => String(p.id).trim() === productId);

  function setProduct(id) {
    onUpdate((s) => ({ ...s, productId: id }));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-brand-muted">Produto do card</span>

      {product && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2">
          <ProductImage src={product.image} alt={product.name} className="size-12 shrink-0 rounded-control bg-brand-background" />
          <div className="min-w-0 flex-1">
            <div className={adminUi.productName}>{product.name}</div>
            <ProductPrice price={product.price} discount={product.activeDiscount} presentation="compact" />
          </div>
          <button
            type="button"
            className={adminUi.iconButton}
            onClick={() => setProduct('')}
            title="Trocar produto"
            aria-label="Trocar produto"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {!product && productId && (
        <p className="text-xs text-danger">
          Produto “{productId}” não encontrado no catálogo — pesquise pelo nome e selecione abaixo.
        </p>
      )}

      <ProductPicker
        products={products}
        excludeIds={product ? [product.id] : []}
        onAdd={setProduct}
        label={product ? 'Trocar por outro produto' : 'Escolher produto'}
        placeholder="Ex.: Cropped, REF 1234 ou o ID"
      />
    </div>
  );
}
