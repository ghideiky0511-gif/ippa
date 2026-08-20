-- Primeiro acesso de uma cliente já cadastrada pela loja. A senha fica
-- pendente até a pessoa comprovar que controla o e-mail salvo no cadastro.
CREATE TABLE client_account_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id)
);

CREATE INDEX client_account_confirmations_token_idx
  ON client_account_confirmations (token_hash);

ALTER TABLE client_account_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_account_confirmations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON client_account_confirmations FOR ALL TO PUBLIC
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON client_account_confirmations TO ippa_app;
