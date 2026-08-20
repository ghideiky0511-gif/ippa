-- Ticket de curta duração pro handshake do WebSocket de pedido (sala
-- Socket.IO /pedidos). O backend passou a ter origem pública própria (ver
-- PLANO-PROXIMOS-PASSOS.md, "Estratégia de tempo real"), então o cookie de
-- sessão do frontend não atravessa — vendedora e cliente entram na sala
-- apresentando um ticket minerado via POST /sessions/:id/realtime-ticket
-- (autenticado normalmente pelo cookie, no domínio do frontend) em vez do
-- próprio cookie. Mesmo padrão de token do restante do app (ver
-- user_sessions / order_sessions.payment_token_hash): valor aleatório
-- devolvido ao cliente, só o hash SHA-256 fica no banco.
CREATE TABLE realtime_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_session_id uuid NOT NULL REFERENCES order_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE realtime_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtime_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON realtime_tickets FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON realtime_tickets TO ippa_app;

CREATE UNIQUE INDEX realtime_tickets_token_hash_idx ON realtime_tickets (token_hash);
CREATE INDEX realtime_tickets_session_idx ON realtime_tickets (order_session_id);
