// @ts-nocheck
'use client';
import { adminUi } from '@/admin/lib/ui';
import { formatBRL } from '@/admin/lib/format';

export default function ProductBlockEditor({ section, onUpdate, products }) {
  const product = (products || []).find((p) => p.id === section.productId);

  function handleChange(e) {
    const productId = e.target.value;
    onUpdate((s) => ({ ...s, productId }));
  }

  return (
    <div className={adminUi.field}>
      <label>ID do produto</label>
      <input value={section.productId || ''} onChange={handleChange} placeholder="cole o ID aqui" />

      {product ? (
        <div className="contents" style={{ marginTop: 8 }}>
          <img src={product.image || ''} alt={product.name} />
          <div>
            <div className={adminUi.productName}>{product.name}</div>
            <div className={adminUi.productPrice}>{formatBRL(product.price)}</div>
          </div>
        </div>
      ) : (
        section.productId && (
          <span className="contents" style={{ marginTop: 8, display: 'block' }}>
            ID não encontrado no catálogo
          </span>
        )
      )}
    </div>
  );
}
