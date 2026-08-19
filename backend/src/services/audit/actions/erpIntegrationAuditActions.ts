export const ERP_INTEGRATION_AUDIT_ACTIONS = {
  // Credenciais de um provider foram salvas (não implica ativação).
  CONFIGURED: 'erp_integration.configured',
  ACTIVATED: 'erp_integration.activated',
  DEACTIVATED: 'erp_integration.deactivated',
} as const;

export type ErpIntegrationAuditAction = (typeof ERP_INTEGRATION_AUDIT_ACTIONS)[keyof typeof ERP_INTEGRATION_AUDIT_ACTIONS];
