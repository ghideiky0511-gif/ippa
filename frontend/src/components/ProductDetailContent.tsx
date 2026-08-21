'use client';
import { publicUi } from '@/lib/ui';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, TrendingUp } from 'lucide-react';
import Link from '@/components/TenantLink';
import { COLOR_MAP, CONFIG } from '@/lib/config';
import { formatBRL, formatMarkup, priceWithPercentOff } from '@/lib/format';
import { getMetQuantityTier, getQuantityDiscountTiers } from '@/lib/discounts';
import { ADDABLE_AVAILABILITY, buildVariantMatrix, deliveryLabel, splitStockQty } from '@/lib/variants';
import { resolveGallery, resolveImageForColor } from '@/lib/images';
import { useCart } from './CartProvider';
import { useAuthUser } from './AuthProvider';
import ProductImage from './ProductImage';
import type { Availability, Product } from '@/domain/products/types';

type AvailabilityFilter = 'all' | 'in_stock' | 'preorder';

function matchesAvailabilityFilter(availability: Availability, filter: AvailabilityFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'in_stock') return availability === 'in_stock';
  return availability === 'preorder' || availability === 'backorder';
}

export default function ProductDetailContent({ product }: { product: Product }) {
  const { cart, discounts, addToCart, changeQty, removeFromCart, setBackorderDate } = useCart();
  const { authUser, showPrices } = useAuthUser();
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

  // Faixas de desconto "por quantidade" (progressivo pelas unidades DESTA
  // peça no carrinho, não o carrinho inteiro — ver /descontos) e qual delas
  // já foi atingida agora. Combinado com o desconto "peças específicas"
  // (product.activeDiscount, calculado em getCatalog()), usa sempre o que
  // dá mais desconto pro cliente pra decidir o preço riscado mostrado.
  const productCartQty = useMemo(
    () => cart.filter((i) => i.id === product.id).reduce((sum, i) => sum + i.qty, 0),
    [cart, product.id]
  );
  const quantityTiers = useMemo(() => getQuantityDiscountTiers(discounts), [discounts]);
  const metTier = useMemo(() => getMetQuantityTier(productCartQty, quantityTiers), [productCartQty, quantityTiers]);
  const effectivePercent = Math.max(product.activeDiscount?.percent || 0, metTier?.percent || 0);
  const effectiveLabel =
    metTier && metTier.percent >= (product.activeDiscount?.percent || 0) ? metTier.label : product.activeDiscount?.label;

  // Anima só no momento em que o carrinho CRUZA uma faixa nova (ex.: a
  // peça que completa 10 no total) — não ao abrir o quick-view já com a
  // faixa atingida de antes, nem ao perder a faixa removendo peças.
  const metTierMinQty = metTier?.minQty ?? null;
  const prevMetTierMinQtyRef = useRef<number | null>(metTierMinQty);
  const [justUnlocked, setJustUnlocked] = useState(false);

  useEffect(() => {
    const prev = prevMetTierMinQtyRef.current;
    if (metTierMinQty !== null && metTierMinQty !== prev && (prev === null || metTierMinQty > prev)) {
      setJustUnlocked(true);
    }
    prevMetTierMinQtyRef.current = metTierMinQty;
  }, [metTierMinQty]);

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
    <div className={publicUi.productDetail}>
      <div className={publicUi.gallery}>
        <ProductImage
          className={publicUi.detailImage}
          src={displayImage}
          alt={product.name}
        />
        {gallery.length > 1 && (
          <div className="contents">
            {gallery.map((src, i) => (
              <ProductImage
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

      <div className={publicUi.detailInfo}>
        <div className="contents">{product.category}{product.subcategory ? ` · ${product.subcategory}` : ''}</div>
        <h2>{product.name}</h2>
        {product.referenceId && <div className="contents">{product.referenceId}</div>}
        {showPrices && (
          <>
            {effectivePercent > 0 ? (
              <div
                className={[publicUi.discountRow, justUnlocked ? 'animate-[qty-discount-pop_.5s_ease]' : ''].join(' ')}
                title={effectiveLabel}
                onAnimationEnd={() => setJustUnlocked(false)}
              >
                <span className={publicUi.originalPrice}>{formatBRL(product.price)}</span>
                <span className="contents">{formatBRL(priceWithPercentOff(product.price, effectivePercent))}</span>
                <span className={publicUi.discountBadge}>-{effectivePercent}%</span>
              </div>
            ) : (
              <div className="contents">{formatBRL(product.price)}</div>
            )}
            {quantityTiers.length > 0 && (
              <div className="contents">
                {quantityTiers.map((t) => (
                  <div key={t.minQty} className={`flex items-center gap-1.5 ${productCartQty >= t.minQty ? 'font-semibold text-[#2e8b57]' : ''}`}>
                    {productCartQty >= t.minQty && <Check className="size-4 shrink-0" aria-hidden="true" />}A partir de {t.minQty} unidades desta peça no carrinho: {t.percent}% de desconto
                  </div>
                ))}
              </div>
            )}
            {showSuggestedPrice && (
              <div className="contents">
                <div className="contents">Preço varejo sugerido</div>
                <div className="contents">
                  <div className="contents">{formatBRL(product.suggestedRetailPrice!)}</div>
                  {markup && (
                    <span className="contents" title="Markup sugerido sobre o preço de atacado">
                      <TrendingUp className="inline size-3.5" aria-hidden="true" />
                      Markup {formatMarkup(markup)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        {product.description && <p className="contents">{product.description}</p>}

        {!authUser && (
          <p className="contents">
            <Link href="/login" className={publicUi.primaryButton}>
              {showPrices ? 'Entre para montar seu carrinho' : 'Entrar para ver o preço e montar seu carrinho'}
            </Link>
          </p>
        )}

        <div className="contents">
          <div className="contents">Cor {selectedColor ? `— ${selectedColor}` : ''}</div>
          <div className="contents">
            <button
              type="button"
              className={'pill-filter' + (selectedColor === null ? ' active' : '')}
              onClick={() => pickColor(null)}
            >
              todas as cores
            </button>
            <div className="contents">
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
          <div className="contents">
            <div className="contents">Grades e packs fechados (grade de fábrica)</div>
            <div className="contents">
              {product.packs.map((pack) => (
                <div key={pack.id} className="contents">
                  <div className="contents">
                    <span className="contents">
                      {pack.label}
                      <span className="rounded-full bg-brand-background px-2 py-0.5 text-[10px] font-semibold text-brand-muted">
                        {pack.scope === 'grade' ? 'grade' : 'pack sortido'}
                      </span>
                    </span>
                    {showPrices ? (
                      <span className="contents">{formatBRL(pack.price)}</span>
                    ) : (
                      <span className="contents">Preço disponível após entrar</span>
                    )}
                  </div>
                  {pack.scope === 'grade' && pack.color && (
                    <div className="contents">
                      <span className={publicUi.swatch} style={{ background: COLOR_MAP[pack.color] || '#ccc' }} />
                      {pack.color}
                    </div>
                  )}
                  <div className="contents">
                    {pack.items.map((item, i) => (
                      <span key={item.size + (item.color || '') + i} className="contents">
                        {pack.scope === 'pack' && item.color && (
                          <span
                            className="contents"
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

      <div className="contents">
        {pendingBackorders.length > 0 && (
          <div className="contents">
            <p className="contents">
              Quantidade além do estoque disponível — escolha a previsão de entrega da diferença:
            </p>
            {pendingBackorders.map(({ item, inStock, excess }) => (
              <div key={item.key} className="contents">
                <span className="contents">
                  {item.color} · {item.size} — {inStock} pronta entrega + <strong>{excess}</strong> sob encomenda
                </span>
                <div className="contents">
                  {CONFIG.backorderDeliveryOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className="contents"
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

        <div className="contents">
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

        <div className="contents">
          <table className="contents">
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
                  <td className="contents">
                    <span className={publicUi.swatch} style={{ background: COLOR_MAP[row.color] || '#ccc' }} />
                    {row.color}
                  </td>
                  {row.cells.map((cell, i) => {
                    const size = matrix.sizes[i];
                    const addable = cell && ADDABLE_AVAILABILITY.has(cell.availability);

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
                        <div className="contents">
                          <button
                            type="button"
                            disabled={!authUser || qty === 0}
                            onClick={() => decrement(row.color, size)}
                          >
                            −
                          </button>
                          <span className="qty-instock">{inStock}</span>
                          {excess > 0 && <span className="contents">+{excess}</span>}
                          <button type="button" disabled={!authUser} onClick={() => increment(row.color, size, cell.stockQty)}>
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
