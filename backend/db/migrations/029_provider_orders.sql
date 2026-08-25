-- Motor de envio de pedidos ao ERP (outbound): fila com estado e retry para
-- mandar um pedido fechado no ippa para o provider ativo do tenant (ver
-- services/erp/orderPushService). Diferente de erp_external_references
-- (migration 011), que só reconcilia id externo de dados IMPORTADOS do ERP
-- (leitura) — aqui o registro é do ENVIO, com status, tentativas e
-- payload/response para depuração, no mesmo espírito de `notifications`
-- (migration 013), mas com um estado a mais (`cancelling`) porque o TOTVS
-- reserva estoque na criação: reenviar um pedido já enviado exige cancelar o
-- anterior no ERP antes de criar o novo, nunca os dois coexistindo lá.

-- audit_action e audit_entity_type são enums (migration 004) — o valor novo
-- precisa existir antes que recordAuditEvent grave provider_order.*.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'provider_order.resend_requested';
ALTER TYPE audit_entity_type ADD VALUE IF NOT EXISTS 'provider_order';

CREATE TABLE provider_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider text NOT NULL,
  -- Id ATIVO do outro lado agora; NULL quando não há nada lá (nunca
  -- enviado, ou cancelado e ainda não recriado). Um resend sempre troca
  -- por um id novo ou volta a NULL — nunca é reescrito para o valor antigo.
  external_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'cancelling', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  response jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(response) = 'object'),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, integration_id) REFERENCES tenant_erp_integrations(tenant_id, id) ON DELETE CASCADE,
  -- Um pedido local tem no máximo um envio acompanhado: reenviar é
  -- transicionar a mesma linha (sent -> cancelling -> pending -> sent de
  -- novo), nunca inserir uma segunda linha para o mesmo pedido.
  UNIQUE (tenant_id, order_id)
);

-- Fila de trabalho pendente (dispatch busca só por isto).
CREATE INDEX provider_orders_dispatch_idx
  ON provider_orders (tenant_id, status, next_attempt_at)
  WHERE status IN ('pending', 'cancelling');

ALTER TABLE provider_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_orders_tenant_isolation ON provider_orders
  FOR ALL TO ippa_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON provider_orders TO ippa_app;
