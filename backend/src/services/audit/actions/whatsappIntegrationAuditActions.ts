export const WHATSAPP_INTEGRATION_AUDIT_ACTIONS = {
  // Embedded Signup concluído com sucesso (número/WABA conectados).
  CONNECTED: 'whatsapp_integration.connected',
  ACTIVATED: 'whatsapp_integration.activated',
  DEACTIVATED: 'whatsapp_integration.deactivated',
  DISCONNECTED: 'whatsapp_integration.disconnected',
  TEMPLATE_SUBMITTED: 'whatsapp_integration.template_submitted',
} as const;

export type WhatsAppIntegrationAuditAction = (typeof WHATSAPP_INTEGRATION_AUDIT_ACTIONS)[keyof typeof WHATSAPP_INTEGRATION_AUDIT_ACTIONS];
