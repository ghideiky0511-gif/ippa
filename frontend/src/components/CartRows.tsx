'use client';
import { publicUi } from '@/lib/ui';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG, COLOR_MAP } from '@/lib/config';
import { formatBRL, priceWithPercentOff } from '@/lib/format';
import { ADDABLE_AVAILABILITY, buildVariantMatrix } from '@/lib/variants';
import { resolveImageForColor } from '@/lib/images';
import { useCart } from './CartProvider';
import { useQuickView } from './QuickViewProvider';
import { useAuthUser } from './AuthProvider';
import type { CartItem } from '@/domain/orders/types';
import type { Product } from '@/domain/products/types';

// Visão de linhas do carrinho na página cheia (não é a de card do drawer —
// ver GroupedCartItems.tsx, resumo enxuto do CartDrawer). Agrupado em dois
// níveis: um bloco por PRODUTO (nome/sku aparecem uma vez só) e, dentro
// dele, uma linha por COR escolhida — uma peça com 2 cores no carrinho
// aparece como 1 bloco com 2 linhas de cor, não como 2 blocos repetindo
// nome/imagem/sku. Cada linha de cor tem a grade INTEIRA de tamanhos
// daquela cor, editável (+/- direto na linha). Peças ainda sem grade
// escolhida (rascunho, ver addDraft em CartProvider.tsx) mostram a mesma
// linha completa (cor/entrega/grade), só que nada ainda está no carrinho
// de verdade até a primeira quantidade ser marcada.
function isDraft(item: CartItem): boolean {
  return !item.color && !item.size;
}

interface Group {
  key: string;
  productId: string;
  color?: string;
  items: CartItem[];
  isDraft: boolean;
}

function groupCart(cart: CartItem[]): Group[] {
  const order: string[] = [];
  const byKey: Record<string, Group> = {};
  for (const item of cart) {
    const draft = isDraft(item);
    const key = draft ? `${item.id}|draft` : `${item.id}|${item.color}`;
    if (!byKey[key]) {
      byKey[key] = { key, productId: item.id, color: draft ? undefined : item.color, items: [], isDraft: draft };
      order.push(key);
    }
    byKey[key].items.push(item);
  }
  return order.map((k) => byKey[k]);
}

// "pronta-entrega" não é uma data real (sem backorderDate) — as demais
// opções vêm de CONFIG.backorderDeliveryOptions (prazo livre por loja). Os
// prazos específicos de pré-venda (que mês/ano fica pronto) ainda não têm
// tela de configuração na loja — fica pra quando isso virar campo editável
// de verdade; por ora reaproveita as mesmas opções do backorder.
const PRONTA_ENTREGA = 'pronta';
const DELIVERY_OPTIONS = [
  { value: PRONTA_ENTREGA, label: 'pronta-entrega' },
  ...CONFIG.backorderDeliveryOptions.map((o) => ({ value: o.label, label: o.label })),
];

// Dropdown de cor com bolinha colorida + nome (em vez de <select> nativo,
// que não dá pra estilizar com a cor dentro das opções). Fecha sozinho
// quando o foco sai do componente (onBlur + relatedTarget), sem precisar
// de listener global de clique.
function ColorSelect({
  colors,
  value,
  onChange,
  disabled,
}: {
  colors: string[];
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={publicUi.colorSelect}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={publicUi.colorSelectTrigger}
        disabled={disabled || colors.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={publicUi.swatch} style={{ background: COLOR_MAP[value] || '#ccc' }} />
        <span className="contents">{value || 'cor'}</span>
        <span className="contents">▾</span>
      </button>
      {open && (
        <ul className={publicUi.colorSelectList}>
          {colors.map((c) => (
            <li key={c}>
              <button
                type="button"
                className={'color-select-option' + (c === value ? ' selected' : '')}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
              >
                <span className={publicUi.swatch} style={{ background: COLOR_MAP[c] || '#ccc' }} />
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Uma linha por cor, dentro do bloco do produto (ver CartProductBlock) —
// sem repetir nome/sku, só a fotinho pequena (troca com a cor), cor,
// entrega, grade e preço daquela cor. Cada cor tem sua PRÓPRIA grade,
// independente das outras — depois que a linha já tem alguma quantidade
// de verdade (group.color definido), a cor fica travada (não dá pra
// "trocar" a cor de uma linha só arrastando a quantidade pra outra, isso
// já causou bug de somar peça amarela em cima de azul). Pra vender mais de
// uma cor da mesma peça, usa o "+ cor" do bloco (CartProductBlock), que
// cria uma linha nova e independente.
function ColorLine({
  group,
  product,
  initialColor,
  isPending,
  onRemove,
  onRemovePending,
}: {
  group: Group;
  product: Product | undefined;
  initialColor?: string;
  isPending?: boolean;
  onRemove: (group: Group) => void;
  onRemovePending?: () => void;
}) {
  const { addToCart, changeQty, replaceItems, setBackorderDateForKeys, cartDiscountByProduct } = useCart();
  const { openQuickView } = useQuickView();
  const { showPrices } = useAuthUser();

  const matrix = useMemo(() => (product ? buildVariantMatrix(product) : null), [product]);
  const colorLocked = !!group.color;

  // Cor "efetiva" da linha: uma vez que a linha já tem cor de verdade
  // (group.color), essa manda e o dropdown fica travado. Enquanto ainda
  // não tem nenhuma quantidade marcada (rascunho ou linha nova de "+ cor"),
  // fica um estado local só pra decidir com qual cor a grade abaixo é
  // mostrada, até a primeira quantidade ser marcada (aí vira de verdade um
  // item com essa cor).
  const [colorValue, setColorValue] = useState(group.color || initialColor || '');
  useEffect(() => {
    if (colorValue) return;
    if (initialColor) {
      setColorValue(initialColor);
    } else if (matrix && matrix.colors.length > 0) {
      setColorValue(matrix.availableColors[0] || matrix.colors[0]);
    }
  }, [matrix, colorValue, initialColor]);

  const [deliveryValue, setDeliveryValue] = useState(
    () => group.items.find((i) => i.qty > 0)?.backorderDate || PRONTA_ENTREGA
  );

  // Linha de "+ cor" (isPending) ainda não tem nenhum CartItem de verdade
  // — nome/preço vêm do produto até a 1ª quantidade ser marcada.
  const first = group.items[0];
  const itemName = first?.name || product?.name || '';
  const image = product ? resolveImageForColor(product, colorValue || group.color) : first?.image;
  const resolvedItems = group.items.filter((i) => i.qty > 0);
  const totalQty = resolvedItems.reduce((s, i) => s + i.qty, 0);
  const totalValue = resolvedItems.reduce((s, i) => s + i.price * i.qty, 0);
  const unitPrice = totalQty > 0 ? totalValue / totalQty : (first?.price ?? product?.price ?? 0);
  const applied = cartDiscountByProduct[group.productId];
  const discountedTotal = applied ? priceWithPercentOff(totalValue, applied.percent) : totalValue;

  const colorRow = matrix?.rows.find((r) => r.color === colorValue);
  const gradeCells = matrix
    ? matrix.sizes
        .map((size, i) => ({ size, cell: colorRow?.cells[i] || null }))
        .filter((c) => c.cell && ADDABLE_AVAILABILITY.has(c.cell.availability))
    : [];

  function qtyForSize(size: string): number {
    return group.items.find((i) => i.color === colorValue && i.size === size)?.qty || 0;
  }

  function handleTrash() {
    if (isPending) {
      onRemovePending?.();
      return;
    }
    replaceItems(group.items.map((i) => i.key), []);
    onRemove(group);
  }

  // Só chega aqui enquanto a linha ainda não tem cor travada (ver
  // colorLocked acima) — o dropdown fica desabilitado depois disso, então
  // não existe mais o caminho de "mover" quantidade de uma cor pra outra.
  function handleColorChange(newColor: string) {
    setColorValue(newColor);
  }

  function handleDeliveryChange(value: string) {
    setDeliveryValue(value);
    const keys = resolvedItems.map((i) => i.key);
    if (keys.length > 0) setBackorderDateForKeys(keys, value === PRONTA_ENTREGA ? null : value);
  }

  function increment(size: string, stockQty?: number) {
    if (!product || !colorValue) return;
    addToCart(product, colorValue, size, 1, stockQty, deliveryValue === PRONTA_ENTREGA ? undefined : deliveryValue);
  }

  // Zerar a quantidade NÃO tira a peça do carrinho — fica com qty 0, pra
  // não sumir sozinha; só a lixeira (handleTrash) remove de verdade.
  function decrement(size: string) {
    if (!colorValue) return;
    const key = [group.productId, colorValue, size].join('|');
    const item = group.items.find((i) => i.key === key);
    if (!item || item.qty === 0) return;
    changeQty(key, item.qty - 1);
  }

  return (
    <div className={publicUi.cartLine}>
      <img src={image || 'https://via.placeholder.com/64x80?text=Sem+imagem'} alt={itemName} />

      <div className={publicUi.cartLineField}>
        <label>Cor</label>
        <ColorSelect
          colors={matrix?.colors.length ? matrix.colors : colorValue ? [colorValue] : []}
          value={colorValue}
          onChange={handleColorChange}
          disabled={!product || colorLocked}
        />
      </div>

      <div className={publicUi.cartLineField}>
        <label>Entrega</label>
        <select value={deliveryValue} onChange={(e) => handleDeliveryChange(e.target.value)}>
          {DELIVERY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className={publicUi.cartLineGrid}>
        {gradeCells.map(({ size, cell }) => {
          const qty = qtyForSize(size);
          return (
            <div key={size} className={publicUi.cartLineCell}>
              <span className="contents">{size}</span>
              <div className="contents">
                <button type="button" disabled={qty === 0} onClick={() => decrement(size)}>−</button>
                <span>{qty}</span>
                <button type="button" onClick={() => increment(size, cell?.stockQty)}>+</button>
              </div>
            </div>
          );
        })}
        {!product && <span className="contents">carregando grade…</span>}
        {product && totalQty === 0 && <span className="contents">Selecione a grade</span>}
      </div>

      <div className={publicUi.cartLinePrice}>
        {showPrices ? (
          <>
            <div>{totalQty} x {formatBRL(unitPrice)}</div>
            {applied ? (
              <div className="contents">
                <span className={publicUi.originalPrice}>{formatBRL(totalValue)}</span>
                <span className={publicUi.discountedPrice}>{formatBRL(discountedTotal)}</span>
              </div>
            ) : (
              <div className="contents">{formatBRL(totalValue)}</div>
            )}
          </>
        ) : (
          <Link href="/login" className="contents">ver preço</Link>
        )}
      </div>

      <button className={publicUi.cartLineAction} onClick={() => product && openQuickView(product)} disabled={!product}>
        ver mais
      </button>

      <button className={publicUi.cartLineTrash} aria-label="Remover cor do carrinho" onClick={handleTrash}>🗑</button>
    </div>
  );
}

// Bloco de um produto: nome/sku uma vez só + uma ColorLine por cor presente
// no carrinho (normalmente 1, mas pode ter mais — daí o motivo desse
// agrupamento: evitar repetir nome/imagem/sku pra cada cor). "+ cor" cria
// uma linha nova (só local, ainda sem nenhum CartItem — ver isPending em
// ColorLine) pra vender outra cor da mesma peça com sua própria grade
// independente; assim que a 1ª quantidade é marcada nela, vira uma linha
// de verdade (entra em colorGroups) e some da lista local.
function CartProductBlock({
  productId,
  product,
  colorGroups,
  removedEntries,
  onRemove,
  onUndo,
}: {
  productId: string;
  product: Product | undefined;
  colorGroups: Group[];
  removedEntries: { key: string; group: Group }[];
  onRemove: (group: Group) => void;
  onUndo: (key: string) => void;
}) {
  const [pendingColors, setPendingColors] = useState<string[]>([]);
  const matrix = useMemo(() => (product ? buildVariantMatrix(product) : null), [product]);

  const sample = colorGroups[0]?.items[0] || removedEntries[0]?.group.items[0];
  if (!sample) return null;

  const usedColors = new Set(colorGroups.map((g) => g.color).filter(Boolean) as string[]);
  const visiblePending = pendingColors.filter((c) => !usedColors.has(c));
  const availableToAdd = (matrix?.colors || []).filter((c) => !usedColors.has(c) && !visiblePending.includes(c));

  function handleAddColor() {
    if (availableToAdd.length === 0) return;
    setPendingColors((prev) => [...prev, availableToAdd[0]]);
  }

  return (
    <div className={publicUi.cartProduct}>
      <div className={publicUi.cartProductHeader}>
        <div className="contents">{sample.name}</div>
        {product?.sku && <div className="contents">{product.sku}</div>}
      </div>
      <div className={publicUi.cartProductLines}>
        {colorGroups.map((g) => (
          <ColorLine key={g.key} group={g} product={product} onRemove={onRemove} />
        ))}
        {visiblePending.map((color) => (
          <ColorLine
            key={`pending:${productId}:${color}`}
            group={{ key: `pending:${productId}:${color}`, productId, color: undefined, items: [], isDraft: true }}
            product={product}
            initialColor={color}
            isPending
            onRemove={onRemove}
            onRemovePending={() => setPendingColors((prev) => prev.filter((c) => c !== color))}
          />
        ))}
        {removedEntries.map(({ key, group }) => (
          <div key={key} className="contents">
            <span>{group.color ? `Cor ${group.color} removida.` : 'Removida do carrinho.'}</span>
            <button className="contents" onClick={() => onUndo(key)}>desfazer</button>
          </div>
        ))}
      </div>
      {availableToAdd.length > 0 && (
        <button className={publicUi.cartAddColor} onClick={handleAddColor}>+ cor</button>
      )}
    </div>
  );
}

export default function CartRows({ cart }: { cart: CartItem[] }) {
  const { catalogById, replaceItems } = useCart();
  const liveGroups = useMemo(() => groupCart(cart), [cart]);
  const groupsByProduct = useMemo(() => {
    const map: Record<string, Group[]> = {};
    for (const g of liveGroups) (map[g.productId] ??= []).push(g);
    return map;
  }, [liveGroups]);

  // Posição estável por PRODUTO: trocar a cor de uma linha, ou uma peça
  // rascunho virar resolvida ao marcar a 1ª quantidade, muda a chave do
  // grupo (productId+cor) mas não deve fazer o bloco pular de lugar —
  // replaceItems reinsere no fim do array do carrinho, então só rastrear
  // por productId (que não muda) evita esse salto.
  const orderRef = useRef<string[]>([]);
  const removedRef = useRef<Record<string, Group>>({});
  for (const g of liveGroups) {
    if (!orderRef.current.includes(g.productId)) orderRef.current.push(g.productId);
    delete removedRef.current[g.key];
  }

  function handleRemove(group: Group) {
    removedRef.current[group.key] = group;
  }

  function handleUndo(key: string) {
    const group = removedRef.current[key];
    if (!group) return;
    delete removedRef.current[key];
    replaceItems([], group.items);
  }

  const productIds = orderRef.current.filter(
    (id) => (groupsByProduct[id] && groupsByProduct[id].length > 0) ||
      Object.values(removedRef.current).some((g) => g.productId === id)
  );

  if (productIds.length === 0) {
    return (
      <div className={publicUi.empty}>
        Seu carrinho está vazio. <Link href="/">Ver catálogo</Link>
      </div>
    );
  }

  return (
    <div className="contents">
      {productIds.map((productId) => (
        <CartProductBlock
          key={productId}
          productId={productId}
          product={catalogById[productId]}
          colorGroups={groupsByProduct[productId] || []}
          removedEntries={Object.entries(removedRef.current)
            .filter(([, g]) => g.productId === productId)
            .map(([key, group]) => ({ key, group }))}
          onRemove={handleRemove}
          onUndo={handleUndo}
        />
      ))}
    </div>
  );
}
