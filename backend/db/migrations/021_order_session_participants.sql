-- Participantes de um atendimento. A presenÃ§a "online agora" continua no
-- Socket.IO; esta tabela preserva quem passou pela sessÃ£o e quando.
-- Nome e papel nÃ£o sÃ£o duplicados aqui: sÃ£o resolvidos da conta atual em
-- users, para que uma troca de nome/papel reflita imediatamente na interface.
CREATE TABLE order_session_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_session_id uuid NOT NULL REFERENCES order_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  first_joined_at timestamptz NOT NULL DEFAULT now(),
  last_joined_at timestamptz NOT NULL DEFAULT now(),
  last_left_at timestamptz,
  join_count integer NOT NULL DEFAULT 1 CHECK (join_count > 0),
  UNIQUE (tenant_id, order_session_id, user_id)
);

CREATE INDEX order_session_participants_session_idx
  ON order_session_participants (tenant_id, order_session_id, last_joined_at DESC);

ALTER TABLE order_session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_session_participants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON order_session_participants FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON order_session_participants TO ippa_app;
