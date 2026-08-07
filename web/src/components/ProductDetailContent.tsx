'use client';

import { useEffect, useMemo, useState } from 'react';
import { COLOR_MAP, CONFIG } from '@/lib/config';
import { formatBRL, formatMarkup } from '@/lib/format';
import { buildVariantMatrix, deliveryLabel, splitStockQty } from '@/lib/variants';
import { resolveGallery, resolveImageForColor } from '@/lib/images';
import { useCart } from './CartProvider';
import type { Availability, Product } from '@/lib/types';

const ADDABLE = new Set<Availability>(['in_stock', 'preorder', 'backorder']);
type AvailabilityFilter = 'all' | 'in_stock' | 'preorder';

function matchesAvailabilityFilter(availability: Availability, filter: AvailabilityFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'in_stock') return availability === 'in_stock';
  return availability === 'preorder' || availability === 'backorder';
}

export default function ProductDetailContent({ product }: { product: Product }) {
  const { cart, addToCart, changeQty, removeFromCart, setBackorderDate } = useCart();
  const matrix = useMemo(() => buildVariantMatrix(product), [product]);
  const gallery = useMemo(() => resolveGallery(product), [product]);
  const [selectedColor, setSelectedColor] = useState<string | null>(
    matrix.availableColors[0] || matrix.colors[0] || null
  );
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  // Liga/desliga dos filtros de pré-venda/pronta-entrega (ver /ferramentas
  // na plataforma admin) — cliente, não vem do getCatalog() porque não é
  // dado de produto, é toggle de página. Mesmo padrão de CatalogApp.tsx
  // buscando /api/highlights: fetch direto sem forçar a rota a virar
  // dynamic. Ausente/erro = tratado como ligado (default de quando a
  // ferramenta foi construída).
  const [toolFlags, setToolFlags] = useState({ preSale: true, readyToShip: true });

  useEffect(() => {
    fetch('/api/store-settings')
      .then((r) => r.json())
      .then((s) =>
        setToolFlags({
          preSale: s?.features?.preSale !== false,
          readyToShip: s?.features?.readyToShip !== false,
        })
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (availabilityFilter === 'preorder' && !toolFlags.preSale) setAvailabilityFilter('all');
    if (availabilityFilter === 'in_stock' && !toolFlags.readyToShip) setAvailabilityFilter('all');
  }, [toolFlags, availabilityFilter]);

  const displayImage = resolveImageForColor(product, selectedColor) || gallery[activeImageIndex] || null;
  const showSuggestedPrice = !!product.suggestedRetailPrice;
  const markup = product.markup || (product.suggestedRetailPrice ? product.suggestedRetailPrice / product.price : undefined);

  // Itens deste produto no carrinho cuja qty passou do estoque (stockQty) e
  // ainda não têm previsão de entrega escolhida pra parte excedente — vira
  // o painel acima da grade pedindo pra resolver isso.
  const pendingBackorders = useMemo(
    () =>
      cart
        .filter((i) => i.id === product.id)
        .map((i) => ({ item: i, ...splitStockQty(i.qty, i.stockQty) }))
        .filter((x) => x.excess > 0 && !x.item.backorderDate),
    [cart, product.id]
  );

  function pickColor(color: string | null) {
    setSelectedColor(color);
    setActiveImageIndex(0);
  }

  function qtyInCart(color: string, size: string) {
    const key = [product.id, color, size].join('|');
    return cart.find((i) => i.key === key)?.qty || 0;
  }

  function increment(color: string, size: string, stockQty?: number) {
    addToCart(product, color, size, 1, stockQty);
  }

  function decrement(color: string, size: string) {
    const key = [product.id, color, size].join('|');
    const item = cart.find((i) => i.key === key);
    if (!item) return;
    if (item.qty <= 1) removeFromCart(key);
    else changeQty(key, item.qty - 1);
  }

  return (
    <div className="product-detail">
      <div className="product-detail-gallery">
        <img
          className="product-detail-image"
          src={displayImage || 'https://via.placeholder.com/500x620?text=Sem+imagem'}
          alt={product.name}
        />
        {gallery.length > 1 && (
          <div className="product-detail-thumbs">
            {gallery.map((src, i) => (
              <img
                key={src + i}
                src={src}
                alt=""
                className={'thumb' + (i === activeImageIndex ? ' selected' : '')}
                onClick={() => setActiveImageIndex(i)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="product-detail-info">
        <div className="cat">{product.category}{product.subcategory ? ` · ${product.subcategory}` : ''}</div>
        <h2>{product.name}</h2>
        {product.sku && <div className="card-sku">{product.sku}</div>}
        <div className="price">{formatBRL(product.price)}</div>
        {showSuggestedPrice && (
          <div className="suggested-price-block">
            <div className="suggested-price-label">Preço varejo sugerido</div>
            <div className="price-row">
              <div className="price-suggested">{formatBRL(product.suggestedRetailPrice!)}</div>
              {markup && (
                <span className="markup-chip" title="Markup sugerido sobre o preço de atacado">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                  Markup {formatMarkup(markup)}
                </span>
              )}
            </div>
          </div>
        )}
        {product.description && <p className="product-detail-desc">{product.description}</p>}

        <div className="color-picker">
          <div className="variant-label">Cor {selectedColor ? `— ${selectedColor}` : ''}</div>
          <div className="pill-row">
            <button
              type="button"
              className={'pill-filter' + (selectedColor === null ? ' active' : '')}
              onClick={() => pickColor(null)}
            >
              todas as cores
            </button>
            <div className="color-options">
              {matrix.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={
                    'color-dot-btn' +
                    (selectedColor === c ? ' selected' : '') +
                    (matrix.availableColors.includes(c) ? '' : ' unavailable')
                  }
                  style={{ background: COLOR_MAP[c] || '#ccc' }}
                  title={c}
                  onClick={() => pickColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        {product.packs && product.packs.length > 0 && (
          <div className="product-packs">
            <div className="variant-label">Grades e packs fechados (grade de fábrica)</div>
            <div className="product-packs-list">
              {product.packs.map((pack) => (
                <div key={pack.id} className="pack-card">
                  <div className="pack-card-header">
                    <span className="pack-card-label">
                      {pack.label}
                      <span className={'pack-scope-tag pack-scope-' + pack.scope}>
                        {pack.scope === 'grade' ? 'grade' : 'pack sortido'}
                      </span>
                    </span>
                    <span className="pack-card-price">{formatBRL(pack.price)}</span>
                  </div>
                  {pack.scope === 'grade' && pack.color && (
                    <div className="pack-card-color">
                      <span className="swatch" style={{ background: COLOR_MAP[pack.color] || '#ccc' }} />
                      {pack.color}
                    </div>
                  )}
                  <div className="pack-card-grade">
                    {pack.items.map((item, i) => (
                      <span key={item.size + (item.color || '') + i} className="pack-grade-chip">
                        {pack.scope === 'pack' && item.color && (
                          <span
                            className="swatch swatch-sm"
                            style={{ background: COLOR_MAP[item.color] || '#ccc' }}
                          />
                        )}
                        {item.size} × {item.qty}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="product-detail-grade">
        {pendingBackorders.length > 0 && (
          <div className="backorder-panel">
            <p className="backorder-panel-title">
              Quantidade além do estoque disponível — escolha a previsão de entrega da diferença:
            </p>
            {pendingBackorders.map(({ item, inStock, excess }) => (
              <div key={item.key} className="backorder-row">
                <span className="backorder-row-label">
                  {item.color} · {item.size} — {inStock} pronta entrega + <strong>{excess}</strong> sob encomenda
                </span>
                <div className="backorder-date-options">
                  {CONFIG.backorderDeliveryOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className="backorder-date-btn"
                      onClick={() => setBackorderDate(item.key, opt.label)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pill-row">
          <button
            type="button"
            className={'pill-filter' + (availabilityFilter === 'all' ? ' active' : '')}
            onClick={() => setAvailabilityFilter('all')}
          >
            todas as entregas
          </button>
          {toolFlags.preSale && (
            <button
              type="button"
              className={'pill-filter pill-filter-preorder' + (availabilityFilter === 'preorder' ? ' active' : '')}
              onClick={() => setAvailabilityFilter('preorder')}
            >
              pré-venda
            </button>
          )}
          {toolFlags.readyToShip && (
            <button
              type="button"
              className={'pill-filter pill-filter-instock' + (availabilityFilter === 'in_stock' ? ' active' : '')}
              onClick={() => setAvailabilityFilter('in_stock')}
            >
              pronta-entrega
            </button>
          )}
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

                    const dimmed = !matchesAvailabilityFilter(cell.availability, availabilityFilter);
                    const qty = qtyInCart(row.color, size);
                    const { inStock, excess } = splitStockQty(qty, cell.stockQty);
                    return (
                      <td
                        key={size}
                        className={
                          'matrix-cell matrix-cell-ok' +
                          (cell.availability !== 'in_stock' ? ' matrix-cell-preorder' : '') +
                          (dimmed ? ' matrix-cell-dimmed' : '')
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
                          <span className="qty-instock">{inStock}</span>
                          {excess > 0 && <span className="qty-excess">+{excess}</span>}
                          <button type="button" onClick={() => increment(row.color, size, cell.stockQty)}>
                            +
                          </button>
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
