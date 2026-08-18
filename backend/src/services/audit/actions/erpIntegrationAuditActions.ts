export const ERP_INTEGRATION_AUDIT_ACTIONS = {
  CONFIGURED: 'erp_integration.configured',
} as const;

export type ErpIntegrationAuditAction = (typeof ERP_INTEGRATION_AUDIT_ACTIONS)[keyof typeof ERP_INTEGRATION_AUDIT_ACTIONS];
