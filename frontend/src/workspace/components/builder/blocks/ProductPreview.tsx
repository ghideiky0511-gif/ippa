// @ts-nocheck
'use client';
import { adminUi } from '@/workspace/lib/ui';
import { formatBRL } from '@/workspace/lib/format';

export default function ProductPreview({ section, products }) {
  const product = (products || []).find((p) => p.id === section.productId);

  if (!product) {
    return (
      <div className={adminUi.previewBlock}>
        <p>Nenhum produto selecionado ainda — cole o ID no painel ao lado.</p>
      </div>
    );
  }

  return (
    <article className="contents">
      <div className="contents">
        <img src={product.image || ''} alt={product.name} />
      </div>
      <div className="contents">
        {product.category && <div className="contents">{product.category}</div>}
        <h3>{product.name}</h3>
        <div className="contents">{formatBRL(product.price)}</div>
      </div>
    </article>
  );
}
