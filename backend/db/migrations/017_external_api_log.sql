-- Observabilidade de chamadas a APIs externas (ERP, etc.): log por
-- requisição e um snapshot por provider para alertar operadores quando um
-- provider fica degradado/indisponível sem precisar varrer o log inteiro.

CREATE TABLE external_api_request_log (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  operation text NOT NULL,
  method text NOT NULL,
  endpoint text NOT NULL,
  endpoint_path text,
  status_code integer,
  success boolean NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  wait_ms integer NOT NULL DEFAULT 0 CHECK (wait_ms >= 0),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  request_payload jsonb,
  response_body text,
  error_message text,
  error_class text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE external_api_provider_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'desconhecido'
    CHECK (status IN ('operacional', 'degradado', 'indisponivel', 'manutencao', 'desconhecido')),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  last_error_summary text,
  last_request_log_id bigint REFERENCES external_api_request_log(id) ON DELETE SET NULL,
  -- Preenchido fora do fluxo automático destas duas tabelas (ex.: um
  -- operador registrando a previsão de retorno de um provider em manutenção).
  expected_back_online_at timestamptz,
  public_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

CREATE INDEX external_api_request_log_tenant_provider_idx
  ON external_api_request_log (tenant_id, provider, created_at DESC);

ALTER TABLE external_api_request_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_api_request_log FORCE ROW LEVEL SECURITY;
CREATE POLICY external_api_request_log_tenant_isolation ON external_api_request_log
  FOR ALL TO ippa_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE external_api_provider_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_api_provider_status FORCE ROW LEVEL SECURITY;
CREATE POLICY external_api_provider_status_tenant_isolation ON external_api_provider_status
  FOR ALL TO ippa_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
