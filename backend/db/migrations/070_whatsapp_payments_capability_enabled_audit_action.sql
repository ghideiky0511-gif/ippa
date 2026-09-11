-- whatsapp_integration.payments_capability_enabled foi adicionado a
-- WHATSAPP_INTEGRATION_AUDIT_ACTIONS (whatsappIntegrationAuditActions.ts)
-- junto do fluxo de confirmação manual de capability_payments, mas nunca
-- chegou a ser adicionado ao enum audit_action -- mesma lacuna já corrigida
-- pela migration 067 para whatsapp_integration.template_submitted. Sem isso,
-- gravar o evento de auditoria após PATCH
-- /api/admin/whatsapp/sellers/:sellerId/payments-capability falha com
-- `invalid input value for enum audit_action:
-- "whatsapp_integration.payments_capability_enabled"` (code 22P02).
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'whatsapp_integration.payments_capability_enabled';
