import type { CartItem, Discount } from "@/lib/types";

export interface AppliedDiscount {
  discount: Discount;
  percent: number;
  amount: number;
}

export interface CartDiscount {
  totalAmount: number;
  label: string | null;
  byProduct: Record<string, AppliedDiscount>;
}

function subtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function evaluate(discount: Discount, productId: string, items: CartItem[]) {
  if (!discount.active) return null;
  if (discount.type === "quantity") {
    const quantity = items.reduce((sum, item) => sum + item.qty, 0);
    const tier = [...discount.tiers].filter((item) => quantity >= item.minQty)
      .sort((left, right) => right.minQty - left.minQty)[0];
    return tier ? { percent: tier.percent, amount: subtotal(items) * tier.percent / 100 } : null;
  }
  return discount.productIds.includes(productId)
    ? { percent: discount.percent, amount: subtotal(items) * discount.percent / 100 }
    : null;
}

export function getProductDiscount(productId: string, cart: CartItem[], discounts: Discount[]): AppliedDiscount | null {
  const items = cart.filter((item) => item.id === productId && item.qty > 0);
  let best: AppliedDiscount | null = null;
  for (const discount of discounts) {
    const result = evaluate(discount, productId, items);
    if (!result) continue;
    const amount = Math.round(result.amount * 100) / 100;
    if (amount > 0 && (!best || amount > best.amount)) best = { discount, percent: result.percent, amount };
  }
  return best;
}

export function getCartDiscount(cart: CartItem[], discounts: Discount[]): CartDiscount {
  const productIds = new Set(cart.filter((item) => item.qty > 0).map((item) => item.id));
  const byProduct: Record<string, AppliedDiscount> = {};
  const labels = new Set<string>();
  let totalAmount = 0;
  for (const productId of productIds) {
    const applied = getProductDiscount(productId, cart, discounts);
    if (!applied) continue;
    byProduct[productId] = applied;
    labels.add(applied.discount.label);
    totalAmount += applied.amount;
  }
  totalAmount = Math.round(totalAmount * 100) / 100;
  return {
    totalAmount,
    label: labels.size === 0 ? null : labels.size === 1 ? [...labels][0] : "Descontos aplicados",
    byProduct,
  };
}

export function getActiveProductDiscount(productId: string, discounts: Discount[]) {
  const matching = discounts.filter((discount) => discount.active && discount.type === "products" &&
    discount.productIds.includes(productId));
  if (matching.length === 0) return null;
  const best = matching.reduce((left, right) => right.percent > left.percent ? right : left);
  return { label: best.label, percent: best.percent };
}
