export const WHATSAPP_INTEGRATION_AUDIT_ACTIONS = {
  // Embedded Signup concluído com sucesso (número/WABA conectados).
  CONNECTED: 'whatsapp_integration.connected',
  ACTIVATED: 'whatsapp_integration.activated',
  DEACTIVATED: 'whatsapp_integration.deactivated',
  DISCONNECTED: 'whatsapp_integration.disconnected',
  TEMPLATE_SUBMITTED: 'whatsapp_integration.template_submitted',
  PAYMENTS_CAPABILITY_ENABLED: 'whatsapp_integration.payments_capability_enabled',
  // Aba Conversas do CRM (crmConversationService.ts) -- entityId aponta
  // para a linha de whatsapp_chat_send_attempts / whatsapp_contact_links
  // envolvida, não para whatsapp_connections como as ações acima.
  CHAT_MESSAGE_SENT: 'whatsapp_integration.chat_message_sent',
  CONVERSATION_LINKED: 'whatsapp_integration.conversation_linked',
} as const;

export type WhatsAppIntegrationAuditAction = (typeof WHATSAPP_INTEGRATION_AUDIT_ACTIONS)[keyof typeof WHATSAPP_INTEGRATION_AUDIT_ACTIONS];
