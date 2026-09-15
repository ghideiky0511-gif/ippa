-- Histórico de tentativas de envio de pedido pelo WhatsApp (botão "Enviar
-- pelo WhatsApp" na página do pedido, ver orderWhatsAppService.sendOrderWhatsApp)
-- -- uma linha por tentativa, sucesso ou falha, para responder "quem mandou
-- o quê, quando, e deu certo?" na tela do pedido. Mesmo desenho de
-- provider_order_attempts (migration 035): log append-only, nunca lido pelo
-- fluxo de envio em si, só pela tela de detalhe do pedido.
--
-- actor_id/actor_role/actor_name sem FK, mesmo critério de audit_events
-- (migration 004): o fato histórico continua identificável mesmo se a conta
-- for removida depois.

CREATE TABLE order_whatsapp_send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('order', 'payment_link', 'payment_order')),
  outcome text NOT NULL CHECK (outcome IN ('sent', 'failed')),
  actor_id uuid NOT NULL,
  actor_role user_role NOT NULL,
  actor_name text NOT NULL,
  to_masked text NOT NULL,
  message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Consulta da página de detalhe de pedido: histórico de UM pedido, mais
-- recente primeiro.
CREATE INDEX order_whatsapp_send_attempts_order_idx
  ON order_whatsapp_send_attempts (tenant_id, order_id, created_at DESC);

ALTER TABLE order_whatsapp_send_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_whatsapp_send_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY order_whatsapp_send_attempts_tenant_isolation ON order_whatsapp_send_attempts
  FOR ALL TO ippa_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

-- Append-only: sem UPDATE/DELETE, é um log de auditoria de envio.
GRANT SELECT, INSERT ON order_whatsapp_send_attempts TO ippa_app;
