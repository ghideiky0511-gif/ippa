-- whatsapp_integration.template_submitted foi adicionado a
-- WHATSAPP_INTEGRATION_AUDIT_ACTIONS (whatsappIntegrationAuditActions.ts)
-- junto do fluxo de submitStandardWhatsAppTemplate, mas nunca chegou a ser
-- adicionado ao enum audit_action -- migration 056 só criou
-- connected/activated/deactivated/disconnected. Sem isso, gravar o evento de
-- auditoria após o template ser criado na Meta falha com
-- `invalid input value for enum audit_action: "whatsapp_integration.template_submitted"`
-- (code 22P02), quebrando o fim do fluxo de submitStandardWhatsAppTemplate
-- mesmo com o template já criado e vinculado com sucesso no bippa-messaging.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'whatsapp_integration.template_submitted';
