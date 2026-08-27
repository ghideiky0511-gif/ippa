'use client';
import { publicUi } from '@/lib/ui';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, TrendingUp } from 'lucide-react';
import Link from '@/components/TenantLink';
import { COLOR_MAP, CONFIG } from '@/lib/config';
import { formatBRL, formatMarkup } from '@/lib/format';
import { productClassificationSummary } from '@/lib/classifications';
import { getMetQuantityTier, getQuantityDiscountTiers } from '@/lib/discounts';
import { ADDABLE_AVAILABILITY, buildVariantMatrix, deliveryLabel, splitStockQty } from '@/lib/variants';
import { resolveGallery, resolveImageForColor } from '@/lib/images';
import { useCart } from './CartProvider';
import { useAuthUser } from './AuthProvider';
import ProductImage from './ProductImage';
import ProductPrice from './ProductPrice';
import { ProductVariantMatrix } from './ui/product-variant-matrix';
import type { Availability, Product } from '@/domain/products/types';

type AvailabilityFilter = 'all' | 'in_stock' | 'preorder';

function matchesAvailabilityFilter(availability: Availability, filter: AvailabilityFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'in_stock') return availability === 'in_stock';
  return availability === 'preorder' || availability === 'backorder';
}

export default function ProductDetailContent({ product, presentation = 'page', onLayoutAnimationComplete }: {
  product: Product;
  presentation?: 'page' | 'panel';
  onLayoutAnimationComplete?: () => void;
}) {
  const isPanel = presentation === 'panel';
  const shouldReduceMotion = useReducedMotion();
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
      .then((s) => {
        const nextToolFlags = {
          preSale: s?.features?.preSale !== false,
          readyToShip: s?.features?.readyToShip !== false,
        };
        setToolFlags(nextToolFlags);
        setAvailabilityFilter((current) => {
          if (current === 'preorder' && !nextToolFlags.preSale) return 'all';
          if (current === 'in_stock' && !nextToolFlags.readyToShip) return 'all';
          return current;
        });
      })
      .catch(() => {});
  }, []);

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
    <motion.div
      layoutId={`product-detail-${product.id}`}
      layout
      transition={{ layout: shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 280, damping: 30, mass: 0.8 } }}
      onLayoutAnimationComplete={onLayoutAnimationComplete}
      className={[publicUi.productDetail, isPanel ? 'grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-4 py-0 max-sm:grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)]' : ''].join(' ')}
    >
      <div className={publicUi.gallery}>
        <ProductImage
          className={[publicUi.detailImage, isPanel ? 'aspect-[4/5]' : ''].join(' ')}
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

      <div className={[publicUi.detailInfo, isPanel ? 'gap-2 text-sm' : ''].join(' ')}>
        <div className={isPanel ? 'text-xs text-brand-muted' : ''}>{productClassificationSummary(product)}</div>
        <h2 className={isPanel ? 'text-base leading-tight' : ''}>{product.name}</h2>
        {product.referenceId && <div className={isPanel ? 'text-xs text-brand-muted' : ''}>{product.referenceId}</div>}
        {showPrices && (
          <>
            <ProductPrice
              price={product.price}
              discount={effectivePercent > 0 ? { percent: effectivePercent, label: effectiveLabel } : undefined}
              presentation="detail"
              animatePromotion={justUnlocked}
              onAnimationEnd={() => setJustUnlocked(false)}
            />
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
        {product.description && <p className={isPanel ? 'line-clamp-3 text-xs leading-5 text-brand-muted' : ''}>{product.description}</p>}

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

        <div className={publicUi.variantPicker}>
          <div className={publicUi.variantFilters}>
            <button
              type="button"
              className={[publicUi.variantFilter, availabilityFilter === 'all' ? publicUi.variantFilterActive : ''].join(' ')}
              onClick={() => setAvailabilityFilter('all')}
            >
              todas as entregas
            </button>
            {toolFlags.preSale && (
              <button
                type="button"
                className={[
                  publicUi.variantFilter,
                  publicUi.variantFilterPreorder,
                  availabilityFilter === 'preorder' ? publicUi.variantFilterActive : '',
                ].join(' ')}
                onClick={() => setAvailabilityFilter('preorder')}
              >
                pré-venda
              </button>
            )}
            {toolFlags.readyToShip && (
              <button
                type="button"
                className={[
                  publicUi.variantFilter,
                  publicUi.variantFilterInStock,
                  availabilityFilter === 'in_stock' ? publicUi.variantFilterActive : '',
                ].join(' ')}
                onClick={() => setAvailabilityFilter('in_stock')}
              >
                pronta-entrega
              </button>
            )}
          </div>
        </div>

        <ProductVariantMatrix
          matrix={matrix}
          renderCell={({ cell, color, size }) => {
            const addable = cell && ADDABLE_AVAILABILITY.has(cell.availability);
            if (!addable) {
              return {
                content: cell ? '✕' : '—',
                className: !cell ? publicUi.variantMatrixCellEmpty : publicUi.variantMatrixCellOut,
                title: cell ? deliveryLabel(cell.availability) : 'Não existe nessa combinação',
              };
            }

            const dimmed = !matchesAvailabilityFilter(cell.availability, availabilityFilter);
            const qty = qtyInCart(color, size);
            const { inStock, excess } = splitStockQty(qty, cell.stockQty);
            return {
              className: dimmed ? publicUi.variantMatrixCellDimmed : undefined,
              title: deliveryLabel(cell.availability),
              content: (
                <div className={[publicUi.variantQtyControl, cell.availability !== 'in_stock' ? publicUi.variantQtyPreorder : ''].join(' ')}>
                  <button type="button" disabled={!authUser || qty === 0} onClick={() => decrement(color, size)}>−</button>
                  <span>{inStock}</span>
                  {excess > 0 && <span className={publicUi.variantQtyExcess}>+{excess}</span>}
                  <button type="button" disabled={!authUser} onClick={() => increment(color, size, cell.stockQty)}>+</button>
                </div>
              ),
            };
          }}
        />
      </div>
    </motion.div>
  );
}
