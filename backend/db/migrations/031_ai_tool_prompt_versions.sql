-- Prompts administrados pelo Control. Cada alteracao cria uma nova versao;
-- execucoes de IA referenciam a revisao efetivamente utilizada sem copiar o
-- texto do prompt para o historico operacional.

CREATE TABLE ai_tool_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tool_key text NOT NULL CHECK (tool_key ~ '^[a-z][a-z0-9._-]{1,63}$'),
  version integer NOT NULL CHECK (version > 0),
  instructions text NOT NULL CHECK (
    length(btrim(instructions)) BETWEEN 20 AND 20000
  ),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_by_platform_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  activated_by_platform_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, tool_key, version),
  CHECK (
    (status = 'active' AND activated_at IS NOT NULL)
    OR status <> 'active'
  )
);

CREATE UNIQUE INDEX ai_tool_prompt_versions_one_active_idx
  ON ai_tool_prompt_versions (tenant_id, tool_key)
  WHERE status = 'active';

CREATE INDEX ai_tool_prompt_versions_history_idx
  ON ai_tool_prompt_versions (tenant_id, tool_key, version DESC);

ALTER TABLE ai_tool_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tool_prompt_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_tool_prompt_versions_tenant_read
  ON ai_tool_prompt_versions
  FOR SELECT TO ippa_app
  USING (tenant_id = app_tenant_id());

GRANT SELECT ON ai_tool_prompt_versions TO ippa_app;
GRANT SELECT, INSERT, UPDATE ON ai_tool_prompt_versions TO ippa_control;

ALTER TABLE ai_tool_executions
  ADD COLUMN prompt_revision text NOT NULL DEFAULT 'code:legacy',
  ADD COLUMN prompt_version_id uuid,
  ADD CONSTRAINT ai_tool_executions_prompt_version_fk
    FOREIGN KEY (tenant_id, prompt_version_id)
    REFERENCES ai_tool_prompt_versions(tenant_id, id)
    ON DELETE SET NULL (prompt_version_id);

DROP INDEX ai_tool_executions_cache_idx;

CREATE INDEX ai_tool_executions_cache_idx
  ON ai_tool_executions (
    tenant_id, tool_key, tool_version, prompt_revision, model, input_hash,
    completed_at DESC
  )
  WHERE status = 'succeeded';
