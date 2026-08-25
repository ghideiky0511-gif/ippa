DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' AND tablename <> 'tenants'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', item.tablename);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', item.tablename);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL TO PUBLIC USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', item.tablename);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ippa_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ippa_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ippa_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ippa_app;
