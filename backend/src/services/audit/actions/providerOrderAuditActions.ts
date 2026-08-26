// Só o pedido manual de reenvio é auditado (ação deliberada de um
// operador). Tentativas automáticas de envio/cancelamento (enqueue no
// pagamento, dispatch em si) não geram audit_events — mesmo critério que
// erpSyncService já usa para os syncs em lote: o rastro dessas tentativas
// já vive em provider_orders.status/response/last_error, um evento de
// auditoria por tentativa só viraria ruído.
export const PROVIDER_ORDER_AUDIT_ACTIONS = {
  RESEND_REQUESTED: 'provider_order.resend_requested',
  CANCEL_REQUESTED: 'provider_order.cancel_requested',
} as const;

export type ProviderOrderAuditAction = (typeof PROVIDER_ORDER_AUDIT_ACTIONS)[keyof typeof PROVIDER_ORDER_AUDIT_ACTIONS];
