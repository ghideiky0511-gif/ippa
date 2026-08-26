-- Fix Supabase database linter warnings:
-- 1) function_search_path_mutable: pin search_path on SECURITY DEFINER helper functions
--    to prevent schema hijacking via a caller-controlled search_path.
-- 2) anon/authenticated_security_definer_function_executable: rls_auto_enable() is a
--    SECURITY DEFINER function publicly callable via PostgREST RPC; revoke public EXECUTE.

ALTER FUNCTION public.app_tenant_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.app_user_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.app_role() SET search_path = public, pg_temp;

-- rls_auto_enable() only exists on the hosted Supabase project (created out-of-band,
-- not via a migration in this repo); skip the REVOKE on environments without it
-- (e.g. local/docker Postgres) so this migration stays applicable everywhere.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
  END IF;
END $$;
