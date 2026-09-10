-- Link temporario enviado pelo WhatsApp para consultar UM pedido. O token
-- original nunca e guardado em texto puro: somente seu hash SHA-256. Depois
-- de consumido, ele vira uma sessao curta e restrita ao mesmo pedido.
CREATE TABLE order_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  access_session_hash text UNIQUE,
  access_session_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_access_tokens_active_session_idx
  ON order_access_tokens (access_session_hash, access_session_expires_at)
  WHERE access_session_hash IS NOT NULL;

CREATE INDEX order_access_tokens_order_id_idx ON order_access_tokens (order_id);

ALTER TABLE order_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_access_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON order_access_tokens FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON order_access_tokens TO ippa_app;
