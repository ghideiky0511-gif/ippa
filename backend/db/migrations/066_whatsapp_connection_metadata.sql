-- Guarda metadados adicionais devolvidos pelo bippa-messaging na associação
-- telefone <-> sender profile, necessários para o fluxo real de templates
-- (backend/docs/mensageria/bippa-messaging/docs/api-reference.md, seção
-- "Templates"): criar um template exige o `waba_id` da conexão
-- (POST /v1/admin/connections/:wabaId/templates) e vincular o template ao
-- sender profile exige o `sender_profile_id` (POST
-- /v1/admin/sender-profiles/:id/template-bindings). Nenhum dos dois vinha
-- sendo persistido -- ver whatsappIntegrationService.associateWhatsAppSenderProfile
-- e whatsappTemplateService.ts.
--
-- Nulas até a primeira associação bem-sucedida (mesma linha de raciocínio de
-- phone_id em whatsapp_connections, migration 063).

ALTER TABLE whatsapp_connections
  ADD COLUMN sender_profile_id text,
  ADD COLUMN waba_id text,
  ADD COLUMN connection_id text;
