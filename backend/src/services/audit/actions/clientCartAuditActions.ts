export const CLIENT_CART_AUDIT_ACTIONS = {
  SAVED: 'client_cart.saved',
} as const;

export type ClientCartAuditAction = (typeof CLIENT_CART_AUDIT_ACTIONS)[keyof typeof CLIENT_CART_AUDIT_ACTIONS];
