-- Notificação de pedido por WhatsApp (Plano 1 -- ver contexto na conversa
-- que originou esta migration): não é a fase de order_details/order_status
-- pagáveis dentro do WhatsApp (essa exige a ippa virar Tech/Solution
-- Provider homologado pela Meta, fora de escopo aqui). Aqui é só um terceiro
-- canal de notificação (confirmação de pedido, link de pagamento) ao lado de
-- e-mail e push in-app, usando message templates comuns da Cloud API.
--
-- Uma linha por VENDEDORA conectada, não por tenant: o produto já modela a
-- relação comercial no nível de vendedora (clients.last_seller_id), não de
-- loja -- um tenant pode ter N vendedoras, cada uma com seu próprio número
-- de WhatsApp Business, conectado via Meta Embedded Signup (fluxo
-- OAuth-like: JS SDK retorna um `code`, o backend troca por token).

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'whatsapp_integration.connected';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'whatsapp_integration.activated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'whatsapp_integration.deactivated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'whatsapp_integration.disconnected';
ALTER TYPE audit_entity_type ADD VALUE IF NOT EXISTS 'whatsapp_integration';

CREATE TYPE whatsapp_integration_status AS ENUM ('pending', 'connected', 'error', 'disconnected');

CREATE TABLE seller_whatsapp_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  -- IV + tag + ciphertext concatenados por whatsappCredentials.ts -- opaco
  -- para o banco de propósito (mesmo desenho de
  -- tenant_payment_integrations.credentials_encrypted, migration 044).
  -- Nasce NULL: a linha é criada em 'pending' quando o onboarding começa e
  -- só ganha um token quando a Meta confirma a troca do `code`.
  access_token_encrypted bytea,
  credentials_meta jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(credentials_meta) = 'object'),
  status whatsapp_integration_status NOT NULL DEFAULT 'pending',
  active boolean NOT NULL DEFAULT false,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone_number_id),
  UNIQUE (tenant_id, seller_id),
  -- Alvo de FK composta (mesmo padrão de tenant_payment_integrations).
  UNIQUE (tenant_id, id)
);
-- UNIQUE (tenant_id, seller_id) acima já garante no máximo uma linha por
-- vendedora (ela reconecta/troca de número sobre a mesma linha, nunca
-- acumula histórico -- mesmo raciocínio de tenant_payment_integrations,
-- UNIQUE (tenant_id, provider)); o tenant como um todo tem quantas
-- vendedoras conectadas quiser, cada uma com sua própria linha `active`.

ALTER TABLE seller_whatsapp_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_whatsapp_integrations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON seller_whatsapp_integrations FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON seller_whatsapp_integrations TO ippa_app;
