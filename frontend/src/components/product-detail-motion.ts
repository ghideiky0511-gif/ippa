/**
 * Contrato de transição compartilhada entre o Quick View e /produto/[id].
 *
 * Não monte um `layoutId` de detalhe de produto fora deste módulo. O Motion
 * só conecta as duas superfícies quando elas estão no mesmo LayoutGroup e
 * recebem exatamente o mesmo ID para o mesmo produto.
 *
 * Guia de manutenção: frontend/docs/product-detail-motion.md
 */
export const PRODUCT_DETAIL_LAYOUT_GROUP_ID = 'product-detail';

export function productDetailLayoutId(productId: string): string {
  return `product-detail-${productId}`;
}

export const PRODUCT_DETAIL_LAYOUT_TRANSITION = {
  type: 'spring',
  stiffness: 280,
  damping: 30,
  mass: 0.8,
} as const;
