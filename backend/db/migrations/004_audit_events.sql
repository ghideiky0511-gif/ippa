CREATE TYPE audit_action AS ENUM (
  'client.created',
  'client.updated',
  'client_cart.saved',
  'order_session.created',
  'authentication.logged_in',
  'authentication.logged_out'
);

CREATE TYPE audit_entity_type AS ENUM ('client', 'client_cart', 'order_session', 'user');

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action audit_action NOT NULL,
  entity_type audit_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  -- Sem FK deliberadamente: o fato histÃ³rico continua identificÃ¡vel mesmo
  -- se a conta for removida posteriormente.
  actor_id uuid NOT NULL,
  actor_role user_role NOT NULL,
  actor_name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_tenant_entity_idx ON audit_events (tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_tenant_actor_idx ON audit_events (tenant_id, actor_id, occurred_at DESC);
CREATE INDEX audit_events_tenant_action_idx ON audit_events (tenant_id, action, occurred_at DESC);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_read ON audit_events FOR SELECT TO ippa_app
  USING (tenant_id = app_tenant_id());
CREATE POLICY audit_events_insert ON audit_events FOR INSERT TO ippa_app
  WITH CHECK (tenant_id = app_tenant_id());

-- Eventos de auditoria sÃ£o imutÃ¡veis para a aplicaÃ§Ã£o: corrigir dados
-- significa adicionar um novo evento, nunca reescrever o passado.
REVOKE UPDATE, DELETE ON audit_events FROM ippa_app;
