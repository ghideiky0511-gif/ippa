-- Histórico de tentativas de envio ao ERP, uma linha por tentativa de
-- dispatch (não por pedido) -- provider_orders (migration 029) guarda só o
-- estado ATUAL (UNIQUE por order_id, sobrescrito a cada tentativa), então
-- não há como reconstruir "o que aconteceu" a partir dela sozinha. Esta
-- tabela é só um log append-only alimentado por
-- orderPushService.finishAndLogAttempt, na mesma transação que atualiza
-- provider_orders -- nunca lida diretamente pelo motor de dispatch.

CREATE TABLE provider_order_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_order_id uuid NOT NULL REFERENCES provider_orders(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider text NOT NULL,
  attempt_number integer NOT NULL,
  -- Espelha o `status` que finishProviderOrderAttempt grava em
  -- provider_orders a cada tentativa, só que sem reaproveitar o nome
  -- ('pending'/'cancelling' viram 'retry_pending'/'retry_cancelling' aqui
  -- para não confundir "próximo estado da fila" com "resultado desta
  -- tentativa específica").
  outcome text NOT NULL CHECK (outcome IN ('sent', 'failed', 'retry_pending', 'retry_cancelling')),
  external_id text,
  error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  response jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Consulta da página de detalhe de pedido: histórico de UM pedido, mais
-- recente primeiro.
CREATE INDEX provider_order_attempts_order_idx
  ON provider_order_attempts (tenant_id, order_id, created_at DESC);

ALTER TABLE provider_order_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_order_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_order_attempts_tenant_isolation ON provider_order_attempts
  FOR ALL TO ippa_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

-- Append-only: sem UPDATE/DELETE, é um log de auditoria de dispatch.
GRANT SELECT, INSERT ON provider_order_attempts TO ippa_app;
