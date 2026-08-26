-- Fix Supabase database linter warnings:
-- 1) function_search_path_mutable: pin search_path on SECURITY DEFINER helper functions
--    to prevent schema hijacking via a caller-controlled search_path.
-- 2) anon/authenticated_security_definer_function_executable: rls_auto_enable() is a
--    SECURITY DEFINER function publicly callable via PostgREST RPC; revoke public EXECUTE.

ALTER FUNCTION public.app_tenant_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.app_user_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.app_role() SET search_path = public, pg_temp;

-- rls_auto_enable() e os papéis anon/authenticated só existem no Postgres
-- gerenciado do Supabase (não são criados por nenhuma migration deste
-- repositório) — sem este guard, rodar as migrations do zero num Postgres
-- comum (docker-compose local, CI) falha aqui. No Supabase real, a função
-- e os papéis existem e o REVOKE roda normalmente.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'rls_auto_enable' AND pronamespace = 'public'::regnamespace
  ) AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated';
  END IF;
END $$;
