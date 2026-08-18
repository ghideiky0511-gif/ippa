// @ts-nocheck
'use client';

import { formatBRL } from '@/admin/lib/format';

export default function ProductPreview({ section, products }) {
  const product = (products || []).find((p) => p.id === section.productId);

  if (!product) {
    return (
      <div className="preview-empty-block">
        <p>Nenhum produto selecionado ainda — cole o ID no painel ao lado.</p>
      </div>
    );
  }

  return (
    <article className="card">
      <div className="card-media">
        <img src={product.image || ''} alt={product.name} />
      </div>
      <div className="body">
        {product.category && <div className="cat">{product.category}</div>}
        <h3>{product.name}</h3>
        <div className="price">{formatBRL(product.price)}</div>
      </div>
    </article>
  );
}
