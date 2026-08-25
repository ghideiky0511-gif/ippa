-- Histórico interno do motor de ferramentas de IA. O payload enviado ao
-- provider nunca é persistido: guardamos somente seu hash, a saída já
-- validada pelo schema da ferramenta e metadados operacionais.

CREATE TABLE ai_tool_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_role text,
  tool_key text NOT NULL,
  tool_version text NOT NULL,
  provider text NOT NULL DEFAULT 'openai',
  model text NOT NULL,
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL
    CHECK (status IN ('processing', 'succeeded', 'failed', 'cached')),
  output jsonb,
  source_execution_id uuid,
  provider_response_id text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  cached_input_tokens integer CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, source_execution_id)
    REFERENCES ai_tool_executions(tenant_id, id)
    ON DELETE SET NULL (source_execution_id)
);

CREATE INDEX ai_tool_executions_history_idx
  ON ai_tool_executions (tenant_id, tool_key, created_at DESC);

CREATE INDEX ai_tool_executions_cache_idx
  ON ai_tool_executions (
    tenant_id, tool_key, tool_version, model, input_hash, completed_at DESC
  )
  WHERE status = 'succeeded';

ALTER TABLE ai_tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tool_executions FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_tool_executions_tenant_isolation ON ai_tool_executions
  FOR ALL TO ippa_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_tool_executions TO ippa_app;
