export const PAYMENT_INTEGRATION_AUDIT_ACTIONS = {
  // Credenciais de um provider foram salvas (não implica ativação).
  CONFIGURED: 'payment_integration.configured',
  ACTIVATED: 'payment_integration.activated',
  DEACTIVATED: 'payment_integration.deactivated',
} as const;

export type PaymentIntegrationAuditAction = (typeof PAYMENT_INTEGRATION_AUDIT_ACTIONS)[keyof typeof PAYMENT_INTEGRATION_AUDIT_ACTIONS];
