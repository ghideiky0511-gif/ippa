import type { CartItem } from '@/domain/orders/types';

// Formato de `details` no erro STOCK_CHANGED lançado por assertOrderItemsInStock
// (backend/src/services/orders/stockGate.ts) e repassado pelo adminJson
// (ver lib/http.ts) como `error.details`.
export interface StockChangeDetail {
  productId: string;
  color?: string;
  size?: string;
  requestedQty: number;
  availableQty: number;
}

export function parseStockChangeDetails(error: unknown): StockChangeDetail[] | null {
  if (!(error instanceof Error)) return null;
  const details = (error as { details?: unknown }).details;
  if (!Array.isArray(details) || details.length === 0) return null;
  const valid = details.every(
    (d): d is StockChangeDetail =>
      typeof d === 'object' &&
      d !== null &&
      typeof (d as StockChangeDetail).productId === 'string' &&
      typeof (d as StockChangeDetail).requestedQty === 'number' &&
      typeof (d as StockChangeDetail).availableQty === 'number',
  );
  return valid ? (details as StockChangeDetail[]) : null;
}

function describe(detail: StockChangeDetail): string {
  const label = [detail.color, detail.size].filter(Boolean).join(' · ') || 'peça';
  return detail.availableQty > 0
    ? `${label}: só ${detail.availableQty} disponível (pedido tinha ${detail.requestedQty})`
    : `${label}: sem estoque`;
}

export function buildStockChangeSummary(details: StockChangeDetail[]): string {
  return details.map(describe).join('; ');
}

// Ajusta o carrinho pra caber no estoque confirmado -- casa cada entrada por
// id+color+size, não por `key` (formato de key difere entre o carrinho da
// loja e o talão, ver CartProvider.tsx x OrderTalaoModal.tsx).
export function applyStockChangeClamp(
  cart: CartItem[],
  details: StockChangeDetail[],
  changeQty: (key: string, qty: number) => void,
  removeFromCart: (key: string) => void,
): void {
  for (const detail of details) {
    const item = cart.find(
      (i) => i.id === detail.productId && i.color === detail.color && i.size === detail.size,
    );
    if (!item) continue;
    if (detail.availableQty <= 0) removeFromCart(item.key);
    else changeQty(item.key, detail.availableQty);
  }
}
