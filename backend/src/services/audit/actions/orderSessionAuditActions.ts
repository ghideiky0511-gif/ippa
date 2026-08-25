export const ORDER_SESSION_AUDIT_ACTIONS = {
  CREATED: 'order_session.created',
} as const;

export type OrderSessionAuditAction = (typeof ORDER_SESSION_AUDIT_ACTIONS)[keyof typeof ORDER_SESSION_AUDIT_ACTIONS];
