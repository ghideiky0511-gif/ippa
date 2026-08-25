// Aplica os descontos cadastrados em /descontos (plataforma admin) sobre o
// carrinho — ver Discount em types.ts. Cadastro existia sem cálculo até
// aqui (ver PLANO-PROXIMOS-PASSOS.md). Cada desconto incide SÓ sobre o
// produto a que se refere — corrigido depois que "por quantidade" somava
// peças de produtos diferentes pra decidir o desconto e aplicava no
// carrinho inteiro (ex.: 1 peça nova entrando com 10% off porque outro
// produto já tinha 10+ unidades). Agora 'quantity' também é por produto: a
// quantidade mínima é contada só com as peças DAQUELE produto no carrinho,
// e o desconto incide só sobre o subtotal daquele produto. Quando mais de
// uma regra ativa se aplica ao MESMO produto, usa só a que dá o MAIOR
// desconto em R$ pra aquele produto — nunca soma duas regras juntas.

import type { CartItem, Discount } from './types';

export interface AppliedDiscount {
  discount: Discount;
  percent: number; // percentual efetivo aplicado — pra 'quantity' é o da faixa atingida, pra 'products' é discount.percent
  amount: number; // valor em R$ descontado do subtotal deste produto, já arredondado
}

function subtotalOf(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

// Percentual + valor do desconto (R$) se essa regra fosse aplicada a este
// produto — null se não bate (quantidade deste produto não atinge nenhuma
// faixa, produto fora da lista de 'products', etc.). `items` já vem
// filtrado só com as linhas deste productId.
function evaluateDiscountForProduct(discount: Discount, productId: string, items: CartItem[]): { percent: number; amount: number } | null {
  if (!discount.active) return null;

  if (discount.type === 'quantity') {
    const qty = items.reduce((sum, i) => sum + i.qty, 0);
    // Faixas não empilham — só a maior faixa atingida vale.
    const tier = [...discount.tiers].filter((t) => qty >= t.minQty).sort((a, b) => b.minQty - a.minQty)[0];
    return tier ? { percent: tier.percent, amount: subtotalOf(items) * (tier.percent / 100) } : null;
  }

  if (!discount.productIds.includes(productId)) return null;
  return { percent: discount.percent, amount: subtotalOf(items) * (discount.percent / 100) };
}

// Melhor desconto que se aplica a UM produto específico do carrinho —
// usado tanto pra linha da peça (GroupedCartItems.tsx, CartRows.tsx) quanto
// pela agregação do carrinho inteiro (getCartDiscount abaixo).
export function getProductDiscount(productId: string, cart: CartItem[], discounts: Discount[]): AppliedDiscount | null {
  const items = cart.filter((i) => i.id === productId && i.qty > 0);
  if (items.length === 0) return null;

  let best: AppliedDiscount | null = null;
  for (const discount of discounts) {
    const evaluated = evaluateDiscountForProduct(discount, productId, items);
    if (!evaluated) continue;
    const amount = Math.round(evaluated.amount * 100) / 100;
    if (amount > 0 && (!best || amount > best.amount)) {
      best = { discount, percent: evaluated.percent, amount };
    }
  }
  return best;
}

export interface CartDiscount {
  totalAmount: number; // soma dos descontos de todos os produtos, já arredondado
  label: string | null; // rótulo pro resumo do pedido — null se nada descontou; se produtos diferentes usaram regras diferentes, vira um rótulo genérico (ver getCartDiscount)
  byProduct: Record<string, AppliedDiscount>; // melhor desconto de CADA produto, pra mostrar risco/valor com desconto na linha da peça
}

// Descontos do carrinho inteiro — cada produto tem seu próprio melhor
// desconto (getProductDiscount), somados aqui pro total e pro rótulo do
// resumo do pedido (/carrinho, /frete, /pagamento, WhatsApp).
export function getCartDiscount(cart: CartItem[], discounts: Discount[]): CartDiscount {
  const productIds = Array.from(new Set(cart.filter((i) => i.qty > 0).map((i) => i.id)));
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
  const label = labels.size === 0 ? null : labels.size === 1 ? [...labels][0] : 'Descontos aplicados';
  return { totalAmount, label, byProduct };
}

// Melhor desconto tipo 'products' ativo que inclui este produto — usado pra
// mostrar preço riscado no card/página do produto (getCatalog() em
// catalog.ts mescla isso no Product antes de servir). Diferente de
// getProductDiscount (que já olha pro carrinho de verdade): aqui é só o
// desconto fixo da peça, sem depender de quantidade em carrinho — por isso
// só olha pra regras 'products', nunca 'quantity' (essa depende de quantas
// unidades desta peça estão no carrinho, que getCatalog() não sabe).
export function getActiveProductDiscount(
  productId: string,
  discounts: Discount[]
): { label: string; percent: number } | null {
  const matching = discounts.filter((d) => d.active && d.type === 'products' && d.productIds.includes(productId));
  if (matching.length === 0) return null;
  const best = matching.reduce((a, b) => (b.percent > a.percent ? b : a));
  return { label: best.label, percent: best.percent };
}

export interface QuantityDiscountTier {
  minQty: number;
  percent: number;
  label: string; // nome do desconto cadastrado que essa faixa pertence
}

// Lista achatada e ordenada (crescente por minQty) de todas as faixas de
// desconto "por quantidade" ativas — usada pra avisar no quick-view/página
// do produto ("a partir de X unidades desta peça, Y% off"), antes mesmo do
// carrinho atingir a faixa. Junta faixas de vários descontos 'quantity'
// cadastrados, se houver mais de um.
export function getQuantityDiscountTiers(discounts: Discount[]): QuantityDiscountTier[] {
  return discounts
    .filter((d) => d.active && d.type === 'quantity')
    .flatMap((d) => d.tiers.map((t) => ({ minQty: t.minQty, percent: t.percent, label: d.label })))
    .sort((a, b) => a.minQty - b.minQty);
}

// Maior faixa já atingida pela quantidade DESTE produto no carrinho — null
// se nenhuma foi atingida ainda. `tiers` precisa vir ordenado crescente (ver
// getQuantityDiscountTiers acima).
export function getMetQuantityTier(productCartQty: number, tiers: QuantityDiscountTier[]): QuantityDiscountTier | null {
  const met = tiers.filter((t) => productCartQty >= t.minQty);
  return met.length > 0 ? met[met.length - 1] : null;
}
