// Ações administrativas manuais sobre o pedido em si (diferente de
// order_session, que já tem seu próprio arquivo). Só ações deliberadas de
// um operador entram aqui -- mesmo critério de providerOrderAuditActions.ts.
export const ORDER_AUDIT_ACTIONS = {
  MANUALLY_MARKED_PAID: 'order.manually_marked_paid',
  MANUALLY_CANCELLED: 'order.manually_cancelled',
  FREIGHT_METHOD_CHANGED: 'order.freight_method_changed',
} as const;

export type OrderAuditAction = (typeof ORDER_AUDIT_ACTIONS)[keyof typeof ORDER_AUDIT_ACTIONS];
