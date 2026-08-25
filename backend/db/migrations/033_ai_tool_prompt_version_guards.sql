-- Evolui a migration 031 sem reescrever o historico ja aplicado.
-- O runtime le somente a versao ativa e o conteudo de uma versao criada nao
-- pode ser sobrescrito; novas alteracoes devem sempre gerar uma nova versao.

DROP POLICY ai_tool_prompt_versions_tenant_read
  ON ai_tool_prompt_versions;

CREATE POLICY ai_tool_prompt_versions_tenant_read
  ON ai_tool_prompt_versions
  FOR SELECT TO ippa_app
  USING (tenant_id = app_tenant_id() AND status = 'active');

CREATE FUNCTION public.prevent_ai_tool_prompt_version_content_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.tool_key IS DISTINCT FROM OLD.tool_key
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.instructions IS DISTINCT FROM OLD.instructions
     OR NEW.created_by_platform_user_id IS DISTINCT FROM OLD.created_by_platform_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'AI prompt version content is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_tool_prompt_versions_immutable_content
  BEFORE UPDATE ON ai_tool_prompt_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_ai_tool_prompt_version_content_update();

REVOKE ALL ON FUNCTION public.prevent_ai_tool_prompt_version_content_update() FROM PUBLIC;
