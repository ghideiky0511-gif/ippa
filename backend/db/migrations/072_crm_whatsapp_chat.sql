-- CRM / inbox de WhatsApp: consumo do bippa-messaging (GET /v1/conversations,
-- GET /v1/conversations/:id/messages, POST /v1/conversations/:id/reply, ver
-- backend/docs/mensageria/bippa-messaging/docs/{api-reference,
-- chat-backend-integration}.md). Nenhuma conversa/mensagem é armazenada
-- aqui -- o bippa-messaging continua sendo o único sistema de registro de
-- conteúdo de chat. As duas tabelas abaixo guardam só o que é próprio do
-- Catálogo: o vínculo com o cadastro de cliente e o log de tentativas de
-- envio (idempotência + auditoria), mesmo desenho de
-- order_whatsapp_send_attempts (migration 071).

-- Vínculo conversa <-> cliente do catálogo, e único lugar do Catálogo onde
-- fica registrado a qual telefone WABA (phone_id) uma conversa pertence --
-- nenhuma rota do bippa-messaging devolve isso a partir só do
-- conversationId (GET /v1/conversations/:id singular não existe; a
-- listagem de mensagens não traz phone_id nos campos disponíveis). Por
-- isso listCrmConversations (crmConversationService.ts) é o único ponto de
-- captura desta coluna, e toda operação por conversationId sozinho
-- (mensagens, service-window, reply, template) resolve phone_id/seller_id
-- daqui -- nunca de entrada do navegador.
--
-- phone_e164 é o telefone do CONTATO (não confundir com phone_id, o número
-- WABA da loja). clients.whatsapp_phone (migration 055) não é único --
-- matriz e filial podem compartilhar o mesmo telefone -- por isso
-- client_id pode ficar nulo mesmo com phone_e164 preenchido, quando o
-- auto-match encontrar mais de um candidato (crmConversationService decide
-- então deixar para vínculo manual).
CREATE TABLE whatsapp_contact_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  phone_id text NOT NULL,
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  link_source text NOT NULL CHECK (link_source IN ('auto', 'manual')),
  linked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, conversation_id)
);

-- Consulta de escopo por vendedora/admin: "quais linhas locais pertencem a
-- este conjunto de phone_id visíveis para o usuário?" -- resolveVisibleInboxes
-- (crmAuthorization.ts) filtra por aqui antes de qualquer chamada ao
-- bippa-messaging.
CREATE INDEX whatsapp_contact_links_phone_id_idx
  ON whatsapp_contact_links (tenant_id, phone_id);

-- Auto-match reverso: dado um telefone de contato normalizado, achar
-- vínculos já resolvidos sem esperar o bippa-messaging.
CREATE INDEX whatsapp_contact_links_phone_e164_idx
  ON whatsapp_contact_links (tenant_id, phone_e164);

-- Navegação "clientes com conversa" / invalidação ao editar um cliente.
CREATE INDEX whatsapp_contact_links_client_id_idx
  ON whatsapp_contact_links (tenant_id, client_id) WHERE client_id IS NOT NULL;

ALTER TABLE whatsapp_contact_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_contact_links FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_contact_links_tenant_isolation ON whatsapp_contact_links
  FOR ALL TO ippa_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

-- Histórico de tentativas de envio pela aba Conversas do CRM -- mesmo
-- desenho de order_whatsapp_send_attempts, mas por conversationId em vez de
-- order_id, e com um `status` de três estados (em vez de outcome
-- sent/failed) porque o envio é assíncrono: o bippa-messaging aceita com
-- 202 antes de a Meta confirmar entrega (ver chat-backend-integration.md,
-- "Uma resposta é aceita de forma assíncrona"). O `id` desta linha, gerado
-- ANTES da chamada ao bippa-messaging, é a base da idempotency_key -- nunca
-- hora atual nem clique temporário (mesma exigência documentada em
-- chat-backend-integration.md, "Envio, reação e idempotência").
CREATE TABLE whatsapp_chat_send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('text', 'template')),
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
  to_masked text NOT NULL,
  template_key text,
  provider_message_id text,
  dispatch_id text,
  error text,
  actor_id uuid NOT NULL,
  actor_role user_role NOT NULL,
  actor_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Thread de tentativas de uma conversa, mais recente primeiro -- espelha
-- order_whatsapp_send_attempts_order_idx.
CREATE INDEX whatsapp_chat_send_attempts_conversation_idx
  ON whatsapp_chat_send_attempts (tenant_id, conversation_id, created_at DESC);

ALTER TABLE whatsapp_chat_send_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chat_send_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_chat_send_attempts_tenant_isolation ON whatsapp_chat_send_attempts
  FOR ALL TO ippa_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

-- Ao contrário de order_whatsapp_send_attempts (append-only, só
-- sent/failed no fim), esta linha é criada como 'queued' e depois
-- atualizada para 'sent'/'failed' com o resultado (dispatch_id ou error) --
-- por isso UPDATE é necessário aqui.
GRANT SELECT, INSERT, UPDATE ON whatsapp_chat_send_attempts TO ippa_app;
GRANT SELECT, INSERT, UPDATE ON whatsapp_contact_links TO ippa_app;

-- Novas ações de auditoria para a entidade whatsapp_integration já
-- existente (audit_entity_type, ver migration 063) -- mesmo padrão de
-- correção aplicado nas migrations 067/070, mas direto na criação desta
-- vez: o enum é estendido na mesma migration que passa a gerar o evento,
-- então não há janela em que o código já grava um valor que o enum ainda
-- não tem.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'whatsapp_integration.chat_message_sent';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'whatsapp_integration.conversation_linked';
