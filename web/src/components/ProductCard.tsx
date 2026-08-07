'use client';

import Link from 'next/link';
import { COLOR_MAP } from '@/lib/config';
import { formatBRL } from '@/lib/format';
import type { Product } from '@/lib/types';

const MAX_DOTS = 6;

export default function ProductCard({
  product,
  onOpenDetail,
}: {
  product: Product;
  onOpenDetail: (product: Product) => void;
}) {
  const colors = product.colors || [];
  const shown = colors.slice(0, MAX_DOTS);
  const extra = colors.length - shown.length;

  return (
    <article className="card">
      <div className="card-media">
        {product.videoUrl ? (
          <video src={product.videoUrl} autoPlay loop muted playsInline disablePictureInPicture />
        ) : (
          <img
            src={product.image || 'https://via.placeholder.com/400x500?text=Sem+imagem'}
            alt={product.name}
          />
        )}
        <button className="card-plus" aria-label="Ver detalhes e adicionar ao carrinho" onClick={() => onOpenDetail(product)}>
          +
        </button>
        {shown.length > 0 && (
          <div className="color-dots">
            {shown.map((c) => (
              <span key={c} className="dot" style={{ background: COLOR_MAP[c] || '#ccc' }} title={c} />
            ))}
            {extra > 0 && <span className="dot-extra">+{extra}</span>}
          </div>
        )}
      </div>
      <div className="body">
        <div className="cat">{product.category || ''}</div>
        <Link href={`/produto/${product.id}`} className="card-title-link">
          <h3>{product.name}</h3>
        </Link>
        {product.sku && <div className="card-sku">{product.sku}</div>}
        <div className="price">{formatBRL(product.price)}</div>
      </div>
    </article>
  );
}
