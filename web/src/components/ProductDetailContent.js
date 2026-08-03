'use client';

import { useMemo } from 'react';
import { COLOR_MAP } from '@/lib/config';
import { formatBRL } from '@/lib/format';
import { buildVariantMatrix, deliveryLabel } from '@/lib/variants';
import { useCart } from './CartProvider';

const ADDABLE = new Set(['in_stock', 'preorder', 'backorder']);

export default function ProductDetailContent({ product }) {
  const { cart, addToCart, changeQty, removeFromCart } = useCart();
  const matrix = useMemo(() => buildVariantMatrix(product), [product]);

  function qtyInCart(color, size) {
    const key = [product.id, color, size].join('|');
    return cart.find((i) => i.key === key)?.qty || 0;
  }

  function increment(color, size) {
    addToCart(product, color, size, 1);
  }

  function decrement(color, size) {
    const key = [product.id, color, size].join('|');
    const item = cart.find((i) => i.key === key);
    if (!item) return;
    if (item.qty <= 1) removeFromCart(key);
    else changeQty(key, item.qty - 1);
  }

  return (
    <div className="product-detail">
      <img
        className="product-detail-image"
        src={product.image || 'https://via.placeholder.com/500x620?text=Sem+imagem'}
        alt={product.name}
      />

      <div className="product-detail-info">
        <div className="cat">{product.category}{product.subcategory ? ` · ${product.subcategory}` : ''}</div>
        <h2>{product.name}</h2>
        <div className="price">{formatBRL(product.price)}</div>
        {product.description && <p className="product-detail-desc">{product.description}</p>}

        <div className="matrix-legend">
          <span><span className="legend-dot legend-ok" />Pronta entrega</span>
          <span><span className="legend-dot legend-preorder" />Pré-venda</span>
          <span><span className="legend-dot legend-out" />Esgotado / indisponível</span>
        </div>

        <div className="matrix-table-wrap">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Cor</th>
                {matrix.sizes.map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.color}>
                  <td className="matrix-color">
                    <span className="swatch" style={{ background: COLOR_MAP[row.color] || '#ccc' }} />
                    {row.color}
                  </td>
                  {row.cells.map((cell, i) => {
                    const size = matrix.sizes[i];
                    const addable = cell && ADDABLE.has(cell.availability);

                    if (!addable) {
                      return (
                        <td
                          key={size}
                          className={'matrix-cell' + (!cell ? ' matrix-cell-empty' : ' matrix-cell-out')}
                          title={cell ? deliveryLabel(cell.availability) : 'Não existe nessa combinação'}
                        >
                          {cell ? '✕' : '—'}
                        </td>
                      );
                    }

                    const qty = qtyInCart(row.color, size);
                    return (
                      <td
                        key={size}
                        className={
                          'matrix-cell matrix-cell-ok' +
                          (cell.availability !== 'in_stock' ? ' matrix-cell-preorder' : '')
                        }
                        title={deliveryLabel(cell.availability)}
                      >
                        <div className="qty-stepper">
                          <button
                            type="button"
                            disabled={qty === 0}
                            onClick={() => decrement(row.color, size)}
                          >
                            −
                          </button>
                          <span>{qty}</span>
                          <button type="button" onClick={() => increment(row.color, size)}>+</button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
